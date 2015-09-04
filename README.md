This is a node.js library that provides access to the [One Platform RPC API](https://github.com/exosite/api/tree/master/rpc).

[![NPM](https://nodei.co/npm/onep.png)](https://nodei.co/npm/onep/) 


## Usage 

```javascript
var rpc = require('onep/rpc');
rpc.call(cik, 'info', [{alias: ''}, {}],
  function(err, rpcresponse, httpresponse) {
  if (err) {
    console.log('error: ' + err);  
  } else {
    if (rpcresponse[0].status === 'ok') {
      console.log(JSON.stringify(rpcresponse[0].result));
    } else {
      console.log('Bad status: ' + rpcresponse[0].status);
    }
  }
});
``` 

## API

### rpc.call

Make a single call to the RPC API. 

```
rpc.call(auth, procedure, arguments, callback)
```

- `auth` may be a 40 character client key (e.g. `'0808160000000000000000000000000000000000'`), or an auth object (e.g. `{cik: '0808160000000000000000000000000000000000', client_key: 'e208160000000000000000000000000000000000'}`). See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#authentication) for details.
- `procedure` is the procedure name, e.g. `'read'` or `'info'`. 
- `arguments` is a list of arguments to pass the call. These are specific to `<procedure>`. See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#procedures) for a list of procedures and arguments.
- `callback` is a function that takes three parameters: 
    `err` is null if the call was made successfully (no HTTP or RPC general error). If the call failed, `err` contains the error message.
    `rpcresponse` contains a list containing a single RPC response. 
    `httpresponse` is the response object.

#### Example

```javascript
var rpc = require('onep/rpc');
rpc.call(
    cik,
    'listing',
    [['client', 'dataport'], {}],
    function(err, rpcresponse, httpresponse) {
      if (err) {
        console.log('error: ' + err);
      } else {
        console.log('response: ' + util.inspect(rpcresponse, false, null));
      }
  });

// output: 
response: [ { status: 'ok',
    result: 
     { client: [ '0808160000000000000000000000000000000000',
         'c138cc0000000000000000000000000000000000',
         'fdc8160000000000000000000000000000000000' ],
       dataport: [ '7e5c6f0000000000000000000000000000000000' ] } } ]
```

### rpc.callMulti

Make multiple calls to the RPC API. 

```
rpc.callMulti(auth, calls, callback)
```

- `auth` may be a 40 character client key (e.g. `'0808160000000000000000000000000000000000'`), or an auth object (e.g. `{cik: '0808160000000000000000000000000000000000', client_key: 'e208160000000000000000000000000000000000'}`). See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#authentication) for details.
- `calls` is a list of calls like this: `{procedure: <procedure>, arguments: <arguments>}`. See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#procedures) for a list of procedures and arguments.
- `callback` is a function is called when the call completes. It takes three parameters: 
    `err` is null if the call was made successfully (no HTTP or RPC general error). If the call failed, `err` contains the error message.
    `rpcresponse` contains a list of RPC responses. 
    `httpresponse` is the response object.

#### Example

```javascript
// get listing and info in one request
rpc.callMulti(
  cik,
  [
    {procedure: 'info', arguments: [{alias: ""}, {basic: true}]}
    {procedure: 'listing', arguments: [['client', 'dataport']]},
  ],
  function(err, rpcresponse, httpresponse) {
    if (err) {
      console.log('error: ' + err);
    } else {
      console.log('response: ' + util.inspect(rpcresponse, false, null));
    }
});

// output:
response: [ { id: 0,
    status: 'ok',
    result: 
     { client: [ '0808160000000000000000000000000000000000',
         'c138cc0000000000000000000000000000000000',
         'fdc8160000000000000000000000000000000000' ],
       dataport: [ '7e5c6f0000000000000000000000000000000000' ] } },
  { id: 1,
    status: 'ok',
    result: 
     { basic: 
        { modified: 1374553089,
          subscribers: 0,
          type: 'client',
          status: 'activated' } } } ]
```

### rpc.tree

Return the RIDs of all descendants of a client.

```
rpc.tree(auth, options, callback)
```

- `auth` may be a 40 character client key (e.g. `'0808160000000000000000000000000000000000'`), or an auth object (e.g. `{cik: '0808160000000000000000000000000000000000', client_key: 'e208160000000000000000000000000000000000'}`). See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#authentication) for details.
- `options` is an object with the following keys, all optional:

    - `depth`  stop at a given depth from the root client (if omitted, depth is not limited)

    - `visit`  function to call for each resource visited. It is called with `rid`, `type`, and `depth` parameters.

    - `types`  list of type strings. Options are 'dataport', 'datarule', 'dispatch'. If omitted, visits only clients.

    - `info`   if non-null, calls info on each resource with the specified options, e.g., `{basic: true}`. May also be a function called with `rid`, `type`, and `depth` parameters for each resource. If a function, it should return null or info options for that resource.

- `callback` is a function is called when the call completes. It takes the following parameters: 

    - `err` is null if the call succeeded. If the call failed, `err` contains the error message.

    - `tree` is the tree. If the call failed, it is undefined.

#### Example

```javascript
rpc.tree(
  '76343a56f23d9ee80f2569c8209f4e9b11a5752e',
  {
    depth: 1,
    visit: function (rid, type, depth) {
      console.log(rid + ' (' + type + ') depth:' + depth);
    },
    types: ['dataport', 'datarule', 'dispatch'],
    info: function(rid, type, depth) {
      return type === 'client' ? {basic: true} : null;
    }
  },
  function(err, tree) { 
    console.log(err ? 'Error ' + err : JSON.stringify(tree, null, 2));
  });

// output
datarule
30e8a54ef29e55415b444ed72a961be4ea0ec270 (client) depth:0
0affc14ebdf520587b6957170ec6af06b7b6ca2a (dataport) depth:1
cbf6f7731ed8ae0285b2e8f9b437356544332679 (dataport) depth:1
a0ebc3d703c94e9b37bb4a2796e447334d7ffea2 (datarule) depth:1
{
  "rid": "30e8a54ef29e55415b444ed72a961be4ea0ec270",
  "type": "client",
  "children": [
    {
      "rid": "0affc14ebdf520587b6957170ec6af06b7b6ca2a",
      "type": "dataport"
    },
    {
      "rid": "cbf6f7731ed8ae0285b2e8f9b437356544332679",
      "type": "dataport"
    },
    {
      "rid": "a0ebc3d703c94e9b37bb4a2796e447334d7ffea2",
      "type": "datarule"
    }
  ],
  "info": {
    "basic": {
      "modified": 1422061952,
      "subscribers": 0,
      "type": "client",
      "status": "activated"
    }
  }
}
```

### rpc.batch

Make a lot of RPC calls, splitting the calls into evenly
sized chunks to avoid timeouts and calling in parallel to
go fast.

```
rpc.batch(auth, calls, options, callback)
```

 * `auth` is an RPC auth object or CIK string
 * `calls` is an array of call objects like this: `{procedure: <procedure>, arguments: <args>}`
 * `options` are:
    
    * `chunkSize` is the number of calls per request
   
    * `parallelLimit` is the maximum number of concurrent requests to run in parallel



### rpc.walk

Walk the object returned by `tree()`.

```
rpc.walk(tree, visit);
```

 * `tree` is the object returned by calling tree()

 * calls `visit(resource, depth, parentRID)` on each resource. For the root resource, parentRID is undefined.


### rpc.setOptions

Set options for connecting to the One Platform.

```
rpc.setOptions(\<options\>)
```

- `<options>` contains one or more options to update. Default options are as follows:

```
{
  host: 'm2.exosite.com',
  path: '/api:v1/rpc/process',
  agent: 'node-onep',
  https: true,
  port: 443,
  strictSSL: true
}
```

You may also specify `timeout` in milliseconds, which defaults to the default for the request module.

## Tests

```
$ cp test/config-template.js test/config.js
$ mocha
```

By default the tests run against the [mock 1P server](https://www.npmjs.com/package/onep-mock). To make them run against production 1P, modify test/config.js with a production CIK and turn off using the mock server.
