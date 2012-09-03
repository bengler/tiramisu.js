var Repeat = require("repeat");
var poll = require("poll");

/**
 * Tested in:
 *  [x] FF 8
 *  [x] Chrome 16
 *  [x] Opera 11.6
 *  [x] Safari 5.1
 *
 *  Known issues/todo:
 *  - Implement multiple file support
 */
function XHRUploader(/*ignored*/form) {

}

XHRUploader.prototype.upload = function (fileField, url) {
  var deferred = $.Deferred();

  //if (!fileField || !file.type.match(/image.*/)) return; todo show thumbnail

  var file = fileField.files[0]; // todo: support multiple files

  var formData = new FormData();
  formData.append(fileField.name, file);

  var xhr = new XMLHttpRequest();
  xhr.open("POST", url);

  xhr.addEventListener("error", function () {
    deferred.reject({status:'failed', message:'connection-error'});
  }, false);

  xhr.addEventListener("abort", function () {
    deferred.reject({status:'failed', message:'aborted'});
  }, false);

  xhr.upload.addEventListener("progress", function (e) {
    // Set to -1 if the file upload API for some reason is unable to provide file stats
    var percent = e.lengthComputable ? Math.ceil((e.loaded / e.total) * 100) : -1;
    deferred.notify({percent:percent, status:'uploading'});
  }, false);

  var poller = poll(function () {
    var chunks = xhr.responseText.split("\n");
    return chunks.slice(0, chunks.length - 1);
  }).every(200, 'ms');

  // ----------
  // Read streamed response from the tiramisu upload action and treat as progress events
  xhr.onreadystatechange = function () {
    if (xhr.readyState === 3) {
      poller.start(); // Start polling the response
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          poller.next().stop(); // finish reading last received chunk of data
        }
      };
    }
  };

  poller.progress(function (chunks) {
    if (xhr.status < 200 || xhr.status > 299) {
      return; // Only handle 2xx response codes here
    }
    chunks.forEach(function (chunk, i) {
      var json;
      try {
        json = JSON.parse(chunk);
      }
      catch (e) { // if its not json, assume the server raised an unexpected error
        json = { percent:100, status:"failed", message:chunk };
      }
      if (json.status === 'failed') {
        deferred.reject(json);
      }
      else {
        deferred.notify(json);
        if (json.status === 'completed') {
          poller.cancel();
          deferred.resolve(json);
        }
      }
    });
  });

  poller.then(function () {
    if (xhr.status < 200 || xhr.status > 299) {
      deferred.reject({status:'failed', message:xhr.statusText});
    }
  });

  // ----------
  xhr.send(formData);
  return deferred;
};

module.exports = XHRUploader;