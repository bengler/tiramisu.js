var Uploader = require("./uploader");
var $ = require("jquery");

/**
 * ImageUploader wraps FileUploader and adds <a few more events>
 * @param form
 * @param fileField
 * @param postUrl
 */
var ImageUploader = function () {
};

var steps = {
  uploading:function (percent) {
    return percent / 100 * 60;
  },
  received:function () {
    return 60;
  },
  transferring:function (percent) {
    return 60 + (percent / 100 * 30);
  },
  completed:function () {
    return 90;
  },
  transcoding:function (percent) {
    return 90 + (percent / 100 * 10);
  },
  failed:function () {
    return 100;
  },
  timeout:function () {
    return 100;
  }
};

var pollForImage = function (url, timeout) {
  var deferred = $.Deferred();
  var loader = new Image();
  var retries = 0;
  var timer;
  var check = function () {
    deferred.notify({status:'transcoding', percent:100 / 20 * retries});
    loader.src = url + "?retry=" + retries++; // Opera will cache it even if it fails
    $(loader).one('load', function () {
      deferred.notify({status:'transcoding', percent:100});
      deferred.resolve(loader.src);
    });
    $(loader).one('error', function () {
      // manually continue polling
      timer = setTimeout(check, 1000);
    });
  };
  check();
  // after <timeout> seconds of unsuccessful polling, reject it
  setTimeout(function () {
    clearTimeout(timer);
    deferred.reject({percent:100, status:"timeout"});
  }, (timeout || 60) * 1000);
  return deferred.promise();
};

ImageUploader.prototype.upload = function () {
  var deferred = $.Deferred();
  var upload = Uploader.prototype.upload.apply(this, arguments);
  upload.progress(function (progress) {
    progress.percent = steps[progress.status](progress.percent);
    deferred.notify(progress);
  });

  upload.then(function (result) {
    var transcode = pollForImage(result.metadata.versions[0].url);
    transcode.progress(function (progress) {
      progress.percent = steps[progress.status](progress.percent);
      deferred.notify(progress);
    });
    transcode.then(function (url) {
      deferred.resolve(result);
    });
    transcode.fail(function () {
      deferred.reject.apply(deferred, arguments);
    });
  });
  upload.fail(function (error) {
    deferred.reject(error); // forward errors
  });
  return deferred.promise();
};

module.exports = ImageUploader;