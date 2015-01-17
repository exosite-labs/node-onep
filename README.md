# One Platform Library for Node.js

This node.js library provides access to the [One Platform RPC API](https://github.com/exosite/api/tree/master/rpc). It's still alpha/unofficial but getting better :-).

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
rpc.call(<auth>, <procedure>, <arguments>, <callback>)
```

- `<auth>` may be a 40 character client key (e.g. `'0808160000000000000000000000000000000000'`), or an auth object (e.g. `{cik: '0808160000000000000000000000000000000000', client_key: 'e208160000000000000000000000000000000000'}`). See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#authentication) for details.
- `<procedure>` is the procedure name, e.g. `'read'` or `'info'`. 
- `<arguments>` is a list of arguments to pass the call. These are specific to `<procedure>`. See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#procedures) for a list of procedures and arguments.
- `<callback>` is a function that takes three parameters: 
    `err` is null if the call was made successfully (no HTTP or RPC general error). If the call failed, `err` contains the error message.
    `rpcresponse` contains a list containing a single RPC response. 
    `httpresponse` is the response object.

#### Example

```javascript
var rpc = require('onep/rpc');
rpc.call(
    cik,
    'listing',
    [['client', 'dataport']],
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
     [ [ '0808160000000000000000000000000000000000',
         'c138cc0000000000000000000000000000000000',
         'fdc8160000000000000000000000000000000000' ],
       [ '7e5c6f0000000000000000000000000000000000' ] ] } ]
```

### rpc.callMulti

Make multiple calls to the RPC API. 

```
rpc.callMulti(<auth>, <calls>, <callback>)
```

- `<auth>` may be a 40 character client key (e.g. `'0808160000000000000000000000000000000000'`), or an auth object (e.g. `{cik: '0808160000000000000000000000000000000000', client_key: 'e208160000000000000000000000000000000000'}`). See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#authentication) for details.
- `<calls>` is a list of calls like this: `{procedure: <procedure>, arguments: <arguments>}`. See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#procedures) for a list of procedures and arguments.
- `<callback>` is a function is called when the call completes. It takes three parameters: 
    `err` is null if the call was made successfully (no HTTP or RPC general error). If the call failed, `err` contains the error message.
    `rpcresponse` contains a list of RPC responses. 
    `httpresponse` is the response object.

#### Example

```javascript
// get listing and info in one request
rpc.callMulti(
  cik,
  [{procedure: 'listing', arguments: [['client', 'dataport']]},
   {procedure: 'info', arguments: [{alias: ""}, {basic: true}]}],
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
     [ [ '0808160000000000000000000000000000000000',
         'c138cc0000000000000000000000000000000000',
         'fdc8160000000000000000000000000000000000' ],
       [ '7e5c6f0000000000000000000000000000000000' ] ] },
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
rpc.tree(<auth>, <options>, <callback>)
```

- `<auth>` may be a 40 character client key (e.g. `'0808160000000000000000000000000000000000'`), or an auth object (e.g. `{cik: '0808160000000000000000000000000000000000', client_key: 'e208160000000000000000000000000000000000'}`). See the [RPC documentation](https://github.com/exosite/api/tree/master/rpc#authentication) for details.
- `<options>` is an object with the following keys, all optional:

    - `depth`              stop at a given depth from the root client (if omitted, depth is not limited)

    - `resource_callback`  function to call for each resource visited. It is called with `rid`, `type`, and `depth` parameters.

    - `types`              list of type strings. Options are 'dataport', 'datarule', 'dispatch'. If omitted, visits only clients.

- `<callback>` is a function is called when the call completes. It takes the following parameters: 

    - `err` is null if the call succeeded. If the call failed, `err` contains the error message.

    - `tree` is the tree. If the call failed, it is undefined.

#### Example

```javascript
rpc.tree(
  cik,
  {
    depth: 2,
    resource_callback: function (rid, type, depth) {
      console.log(rid + ' (' + type + ') depth:' + depth);
    },
    types: ['dataport', 'datarule', 'dispatch']
  },
  function(err, tree) { 
     if (err) 
        console.log('error: ' + err);
     else 
        console.log(JSON.stringify(tree, null, 2));
   }
);

// output:
Visiting a755fa0000000000000000000000000000000000 (client) depth:1
Visiting e817900000000000000000000000000000000000 (client) depth:1
Visiting 51f6b80000000000000000000000000000000000 (client) depth:2
Visiting 85379c0000000000000000000000000000000000 (client) depth:2
Visiting cd78380000000000000000000000000000000000 (client) depth:2
Visiting 1deec50000000000000000000000000000000000 (client) depth:2
Visiting 807ccf0000000000000000000000000000000000 (client) depth:2
Visiting 7f5cba0000000000000000000000000000000000 (client) depth:2
[
  {
    "rid": "a755fa0000000000000000000000000000000000",
    "tree": [
      {
        "rid": "1deec50000000000000000000000000000000000",
        "type": "dataport"
      },
      {
        "rid": "807ccf0000000000000000000000000000000000",
        "type": "dataport"
      },
      {
        "rid": "7f5cba0000000000000000000000000000000000",
        "type": "datarule"
      }
    ]
  },
  {
    "rid": "e817900000000000000000000000000000000000",
    "tree": [
      {
        "rid": "51f6b80000000000000000000000000000000000",
        "type": "dataport"
      },
      {
        "rid": "85379c0000000000000000000000000000000000",
        "type": "dataport"
      },
      {
        "rid": "cd78380000000000000000000000000000000000",
        "type": "datarule"
      }
    ]
  }
]
```

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
  https: false,
  port: 80
}
```

You can also specify `timeout` in milliseconds, which defaults to the default for the request module.

## Tests

```
$ cp test/test-template.js test/test.js
$ mocha
```

By default the tests run against the [mock 1P server](https://www.npmjs.com/package/onep-mock). To make them run against production 1P, modify test/test.js with a production CIK and turn off using the mock server.
