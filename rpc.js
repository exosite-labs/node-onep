// node.js library for Exosite One Platform
//
exports.call = function(auth, procedure, args, handlers) {
  exports.callmulti(auth, 
                    [{procedure: procedure, arguments: args}], 
                    handlers);
}

exports.callmulti = function(auth, calls, handlers) {
  var http = require('http');
  //var _ = require('underscore');

  if (typeof auth === 'string') {
    auth = {'cik': auth};
  }

  var bodyobj = {
    calls: [],
    auth: auth
  };
  for (var i = 0; i < calls.length; i++) {
    var call = calls[i];
    bodyobj.calls.push({id: i,
                        procedure: call.procedure,
                        arguments: call.arguments});
  }
  var body = JSON.stringify(bodyobj);
  var options = {
    hostname: 'm2.exosite.com',
    port: 80,
    path: '/api:v1/rpc/process',
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-length': body.length,
      'user-agent': 'node-onep'
    }
  }
  //console.log(JSON.stringify(options));
  //console.log(body);
  
  var req = http.request(options, function(res) {
    res.setEncoding('utf8');
    var responsebody = '';
    res.on('data', function(chunk) {
      responsebody += chunk;
    });
    res.on('end', function() {
      if (responsebody.length === 0) {
        handlers.error("Empty response body", null);
      } else {
        var obj = JSON.parse(responsebody);
        if (!Array.isArray(obj)) {
          handlers.error('General RPC error: ' + JSON.stringify(obj.error), null);
        } else {
          var responses = [];
          for (var i = 0; i < calls.length; i++) {
            responses.push(null);
          }
          for (var i = 0; i < obj.length; i++) {
            var response = obj[i];
            var id = response.id;
            delete response['id'];
            responses[id] = response;
          } 
          handlers.success(responses, res);
        }
      }
    });
  });

  req.on('error', function(e) {
    handlers.error(e.message, e);
  });

  req.write(body);
  req.end();
}
