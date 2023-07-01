'use strict';

var http = require('http');

process.on('uncaughtException', function(err){
  console.error('uncaughtException: ' + err.message);
  console.error(err.stack);
});


http.createServer(onRequest).listen(9000);


const azure = require("./azure.js");

async function onRequest(client_req, client_res) {
  const requestId = client_req.headers["x-api-requestid"] || "(empty)";
  try{
    if (!hasPrefix(client_req.url, "/api/azure")){
      localReply(client_res, 404, `no resource can be found at ${client_req.url}`)
      return;
    }

    const ccbReq = await convertToRequestObject(client_req, "/api/azure");
    const ccbResponse = await azure.main(ccbReq);

    client_res.writeHead(ccbResponse.statusCode, ccbResponse.headers);
    if(!!ccbResponse.body != null){
      client_res.end(ccbResponse.body);
    }

  }catch(ex){
    console.warn('error: ' + ex.message);
    console.warn(ex.stack);

    try{
      client_res.writeHead(500, {
        "Content-Type": "text/plain"
      });
      client_res.end(`Internal server error: ${ex.toString()}\nRequestId:${requestId}`);
    }
    catch(_){}
  }
}

async function convertToRequestObject(client_req, removePrefix){
  let fullUrl = client_req.url;
  if (!!removePrefix && 
      fullUrl.length > removePrefix.length && 
      removePrefix === fullUrl.substr(0, removePrefix.length)){
      fullUrl = fullUrl.substr(removePrefix.length)
  }
  
  const indexOfQuestionMark = fullUrl.indexOf("?")
  let path = fullUrl;
  let queryStr = "";
  let query = {};

  if (indexOfQuestionMark > -1){
    path = fullUrl.substr(0, indexOfQuestionMark);
    queryStr = indexOfQuestionMark == (fullUrl.length - 1) ? "" : fullUrl.substr(indexOfQuestionMark+1);
    if (queryStr !== ""){
      let pairs = queryStr.split("&");
      pairs.forEach((p)=>{
        const kv = p.split("=");
        const k = kv[0];
        const v = kv.length == 1 ? "" : kv[1];
        query[k] = v
      });
    }
  }

  const body = await getRequestBody(client_req);
  // 根据云开发文档，构造它所需要的结构：https://cloud.tencent.com/document/product/876/41776
  return {
      path: path,
      httpMethod: client_req.method,
      headers: client_req.headers,
      queryStringParameters: query,
      requestContext: {},
      body: body,
      isBase64Encoded: false
  }
}


function getRequestBody(request) {
  return new Promise((resolve) => {
    const bodyParts = [];
    let body;
    request.on('data', (chunk) => {
      bodyParts.push(chunk);
    }).on('end', () => {
      body = Buffer.concat(bodyParts).toString();
      resolve(body)
    });
  });
}

function localReply(client_res, statusCode, content){
  client_res.writeHead(statusCode, {
    "Content-Type": "text/plain"
  });
  client_res.end(content);
}

function hasPrefix(s, prefix){
  return s.length >= prefix.length && prefix === s.substr(0, prefix.length);
}
