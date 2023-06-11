'use strict';

let OPENAI_HOSTNAME='api.openai.com'
let ENTRYPOINT_TOKEN=''

if (!!process.env.OPENAI_HOSTNAME){
  OPENAI_HOSTNAME = process.env.OPENAI_HOSTNAME;
}

if (!!process.env.ENTRYPOINT_TOKEN){
  ENTRYPOINT_TOKEN = process.env.ENTRYPOINT_TOKEN;
}

var http = require('http');
var https = require('https')

process.on('uncaughtException', function(err){
  console.error('uncaughtException: ' + err.message);
  console.error(err.stack);
});


http.createServer(onRequest).listen(9000);

function onRequest(client_req, client_res) {
  const requestId = client_req.headers["x-api-requestid"] || "(empty)";

  try{
    if (!!ENTRYPOINT_TOKEN && client_req.headers["x-entrypoint-token"] !== ENTRYPOINT_TOKEN){
      client_res.writeHead(502, {
        "Content-Type": "text/plain"
      });
      client_res.end(`no unhealthy upstream\nRequestId:${requestId}`);
      return
    }

    delete client_req.headers["x-entrypoint-token"]
    const apiHost = OPENAI_HOSTNAME;
    client_req.headers.host = apiHost;
    var options = {
      hostname: apiHost,
      port: 443,
      path: client_req.url,
      method: client_req.method,
      headers: client_req.headers,
      protocol: "https:",
      timeout: 10000
    };

    var proxy = https.request(options, function (res) {
      client_res.writeHead(res.statusCode, res.headers)
      res.pipe(client_res, {
        end: true
      });
    });

    client_req.pipe(proxy, {
      end: true
    });
  }catch(ex){
    console.warn('error: ' + err.message);
    console.warn(err.stack);

    try{
      client_res.writeHead(500, {
        "Content-Type": "text/plain"
      });
      client_res.end(`Internal server error: ${ex.toString()}\nRequestId:${requestId}`);
    }
    catch(_){}
  }
}
