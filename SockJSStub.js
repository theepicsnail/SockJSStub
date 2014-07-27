// Node versions might not have Promises
if (typeof require !== 'undefined') {
  if (typeof Promise === 'undefined') {
    Promise = require('es6-promise').Promise;
  }
}
(function(exports) {

  function SockJSStub(sockjs) {
    var stub = new Stub();
    stub.send = sockjs.send.bind(sockjs);
    var oldOnMessage = sockjs.onmessage;
    sockjs.onmessage = function(e) {
      if(!stub.onMessage(e.data) && oldOnMessage) {
        oldOnMessage(e);
      }
    };
    return stub;
  }
  function SockJSServerStub(connection) {
    var stub = new Stub();
    stub.send = connection.write.bind(connection);
    connection.on('data', stub.onMessage.bind(stub));
    return stub;
  }

  function Stub(socket) {
    /*
      socket should have at least:
      socket.send(string) - called by Stub to send data out
      socket.onmessage(string) - set by Stub to be called upon data

      These should be valid for 'new Stub(socket)' to work properly:
      socket.send('asdf')
      sock.onmessage = function(msg) {
        console.log(msg);
      }

    */
    // Internal api:
    this.rpcId = 0; // Counter used for cordinating messages
    this.pendingRpcs = {}; // rpcId -> Promise.accept callback
    this.handlers = {}; // string(eventName) -> [callbacks]

    // External api:
    this.on = this.on.bind(this);
    this.call = this.call.bind(this);
  }

  Stub.prototype = {
    //send: [socket.send],
    call: function (eventName, args) {
      /*
        Send a new RPC message. Returns a promise that's called
        when the other end returns.

        Example:
        rpc.call('add',[ 1, 2 ])
        .then(function(value) {
          console.log(value);
        });
      */
      return new Promise(function (ret) {
        var id = this.rpcId ++;
        this.pendingRpcs[id] = ret;
        blob = JSON.stringify({ rpcId: id,
                    direction: 'request',
                    eventName: eventName,
                    args: args });
        this.send(blob);
      }.bind(this));
    },

    callHandler: function(handler, args, id) {
      /*
        Called by onMessage, this method calls the actual callback, with
        the args received from the rpc request.

        This is also responible for handling the callback's reply.
        If a callback returns a non undefined result, or if the callback
        uses 'this.return(value)' a reply is generated and sent to the
        requester of the rpc.

        For synchronous methods, just return the value:
          rpc.on('foo', function (a+b) {
            return a+b;
          });

        For asynchronous methods, use the 'this.return' callback:
          rpc.on('query', function(str) {
            redis.query(str).then(function(reply) {
              // async return
              this.return(reply);
            });
          });

        TODO handle methods that don't have return values at all.
              This might be doable with a method that gives you the async return callback
              but also sets a flag specifying that they are async.
              If the method returns undefined, and that flag is still unset, we know they
              didn't return anything, and they didn't ask for the callback, so it's void.
        TODO handle exceptions and forward them to the .catch half of the promise
      */
      var send = this.send;
      setTimeout(function () {
        new Promise(function(accept) {
          var ret;
          try {
            // allow 'this.return' to be called for async functions
            ret = handler.apply({'return': accept}, args);

          } finally {
            if(ret !== undefined) {
              accept(ret);
            }
          }
        }).then(function (value) {
          send(JSON.stringify({ rpcId: id,
              direction: 'reply', value: value}));
        });
      }, 0);
    },

    onMessage: function (message) {
      /*
        Called by the underlying socket when a message is receive.

        This is responsible for handing new requests, and replies from
        old requests.

        In the case of new requests, it will start the approriate callbacks.
        In the case of a reply, it will finish the approriate promise(s).
      */
      var obj, id, direction;
      try {
        obj = JSON.parse(message);
        id = obj.rpcId;
        direction = obj.direction;
      } catch (error) {
        console.warn("Couldn't parse message:", message, error);
        return false;
      }
      // rpc request {rpcId:0, direction:'request', eventName: 'asdf', args:[] }
      // rpc reply   {rpcId:0, direction:'reply', value:'something' }

      if (obj.direction === 'request') { // Handle rpc request
        var handlers = this.handlers[obj.eventName] || [];
        var hid;
        if (handlers.length === 0) {
          console.warn("Received rpc request for unbounded event:", obj);
        }

        for (hid = handlers.length-1; hid >= 0; --hid) {
          this.callHandler(handlers[hid], obj.args, id);
        }
      }

      if (obj.direction === 'reply') { // Handle rpc replies
        (this.pendingRpcs[id] || function () {
          console.warn("Got reply for non-existant rpc:", obj);
        })(obj.value);
      }

      return true;
    },

    on: function (eventName, callback) {
      /*
        Register a new handler.
        These functions will we called when the other end of the
        connection calls the corresponding rpc.call method.
      */
      this.handlers[eventName] = (this.handlers[eventName] || []).concat([callback]);
    }
  };
  exports.Stub = Stub;
  exports.SockJSStub = SockJSStub;
  exports.SockJSServerStub = SockJSServerStub;
}(typeof exports === 'undefined'? this.SockJSStub={}: exports));
