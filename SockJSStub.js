(function(exports) {

  exports.foo = function() {
    console.log("foo");
  };

}(typeof exports === 'undefined'? this.SockJSStub={}: exports));
