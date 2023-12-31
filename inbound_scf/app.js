'use strict';

var http = require('http');

process.on('uncaughtException', function(err){
  console.error('uncaughtException: ' + err.message);
  console.error(err.stack);
});


http.createServer(onRequest).listen(9000);

const allowed_codes = readAccessCodes();

const azure = require("./azure.js");
const openai = require("./openai.js");

async function onRequest(client_req, client_res) {
  const requestId = client_req.headers["x-api-requestid"] || "(empty)";
  try{
    let accessCode = "";
    if (!!client_req.headers["authorization"] && client_req.headers["authorization"].startsWith("Bearer ak-")){
      accessCode = client_req.headers["authorization"].substr("Bearer ak-".length)
    }

    if (!!allowed_codes){
      if (!accessCode || !allowed_codes[accessCode]){
        const statusCode = !accessCode ? 401 : 403;
        const responseText = !accessCode ? "UnAuthorized" : `Code '${accessCode}' not allowed.`

        console.log("Access denied: " + responseText);
        localReply(client_res, statusCode, responseText)
        return;
      }
      console.log("Client user:" + allowed_codes[accessCode]);
    } else {
      console.log("Auth disabled");
      readAccessCodes();
    }

    const ccbReq = await convertToRequestObject(client_req, "/api/azure");
    let ccbResponse;
    if (hasPrefix(client_req.url, "/api/azure")){
      ccbResponse = await azure.main(ccbReq);
    }else if (hasPrefix(client_req.url, "/api/openai")){
      ccbResponse = await openai.main(ccbReq);
    }else{
      localReply(client_res, 404, `no resource can be found at ${client_req.url}`)
      return;
    }

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

function localReply(client_res, statusCode, content, headers){
  if (!headers){
    headers = {}
  }
  if (!headers["Content-Type"] || !headers["content-type"]){
    headers["Content-Type"] = "text/plain";
  }
  client_res.writeHead(statusCode, headers);

  if(!!content && typeof content === "object"){
    content = JSON.stringify(content)
  }
  client_res.end(content || '');
}

function readAccessCodes(){
  const fs = require('fs');
  const accessCodesFile = './access-codes.json';
  let accessCodeContent = '';

  try {
    if (!fs.existsSync(accessCodesFile)) {
      console.error(`no such file: ${accessCodesFile}`);
      return null;
    }
    accessCodeContent = fs.readFileSync(accessCodesFile, { encoding: 'utf8', flag: 'r' });
  } catch(err) {
    console.error(`error reading ${accessCodesFile}: ${err.message}`);
    return null;
  }

  try {
    const nameValuePair = JSON.parse(accessCodeContent);
    const valueNamePair = {};
    for(const name in nameValuePair){
      if (nameValuePair.hasOwnProperty(name)){
        if(!!valueNamePair[ nameValuePair[name]]){
          console.warn(`duplicated access key ignored in ${accessCodesFile}. user: ${name}`);
          continue;
        }

        valueNamePair[ nameValuePair[name] ] = name;
      }
    }

    return valueNamePair;
  }catch(err){
    console.error(`error parsing ${accessCodesFile}: ${err.message}`);
    return null;
  }
}

function hasPrefix(s, prefix){
  return s.length >= prefix.length && prefix === s.substr(0, prefix.length);
}
