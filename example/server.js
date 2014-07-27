require('es6-promise');

var http = require('http');
var sockjs = require('sockjs');
var node_static = require('node-static');
var Stub = require('SockJSStub');

// 1. Echo sockjs server
var sockjs_opts = {sockjs_url: "http://cdn.sockjs.org/sockjs-0.3.min.js"};

var sockjs_echo = sockjs.createServer(sockjs_opts);
sockjs_echo.on('connection', function(conn) {
    var stub = Stub.SockJSServerStub(conn);
    //stub.on('length', function(message) {
    //  return message.length;
    //});
    stub.on('length', function(message) {
      setTimeout(function(){
        this.return("Async slow return:" + message.length);
      }.bind(this), 1000);
    });
    conn.on('data', function(message) {
      conn.write(message);
    });
});

// 2. Static files server
var static_directory = new node_static.Server(__dirname);

// 3. Usual http stuff
var server = http.createServer();
server.addListener('request', function(req, res) {
    static_directory.serve(req, res);
});
server.addListener('upgrade', function(req,res){
    res.end();
});

sockjs_echo.installHandlers(server, {prefix:'/echo'});

console.log(' [*] Listening on 0.0.0.0:2000' );
server.listen(2000, '0.0.0.0');
