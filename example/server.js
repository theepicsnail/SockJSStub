require('es6-promise');

var http = require('http');
var sockjs = require('sockjs');
var node_static = require('node-static');
var Stub = require('SockJSStub');


function handleConnection(conn){
  // Stub the connection
  var stub = Stub.SockJSServerStub(conn);
  stub.on('add', function(a,b){
    return a+b;
  });
  stub.on('addAsync', function(a,b) {
    setTimeout(function(){
      this.return(a+b);
    }.bind(this), 1000);
  });

  stub.on('foo', function(n) {
    stub.call('bar', [n,n*2]).then(this.return);
  });
}



var sockjs_opts = {sockjs_url: "http://cdn.sockjs.org/sockjs-0.3.min.js"};
var sockjs_echo = sockjs.createServer(sockjs_opts);
sockjs_echo.on('connection', handleConnection);


var static_directory = new node_static.Server(__dirname);
var server = http.createServer();
server.addListener('request', function(req, res) {
    static_directory.serve(req, res);
});
server.addListener('upgrade', function(req,res){
    res.end();
});

sockjs_echo.installHandlers(server, {prefix:'/sjs'});

console.log(' [*] Listening on 0.0.0.0:2000' );
server.listen(2000, '0.0.0.0');
