// example usage of onep.js
//

(function() {
  var util = require('util');
  var rpc = require('./rpc');

  rpc.call(
    'CIKHERE',
    'listing',
    [['client', 'dataport']],
    {
      success: function(rpcresponse, httpresponse) {
        console.log('response status: ' + httpresponse.statusCode);
        console.log('response headers: ' + JSON.stringify(httpresponse.headers));
        console.log('response body: ' + util.inspect(rpcresponse, false, null));
      },
      error: function(message, e) {
        console.log('error: ' + message);
      }
    });

}).call(this);
