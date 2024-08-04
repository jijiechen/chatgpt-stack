'use strict';

let OpenAIBaseUrl = "https://api.openai.com"
let OpenAIOrgID = ""
let OpenAIBearerToken = "" // Bearer <>
let Entrypoint_Token = ""


if (!!process.env.OPENAI_BASE_URL){
  OpenAIBaseUrl = process.env.OPENAI_BASE_URL;
}

if (!!process.env.OPENAI_ORG_ID){
  OpenAIOrgID = process.env.OPENAI_ORG_ID;
}

if (!!process.env.OPENAI_TOKEN){
  OpenAIBearerToken = process.env.OPENAI_TOKEN;
  if(!OpenAIBearerToken.startsWith("Bearer ")){
    OpenAIBearerToken = "Bearer " + OpenAIBearerToken;
  }
}

if (!!process.env.ENTRYPOINT_TOKEN){
  Entrypoint_Token = process.env.ENTRYPOINT_TOKEN;
}

module.exports.main = async function (client_req, client_res, reqInfo) {
    try {
      console.log("Client request:" + JSON.stringify(reqInfo));
      const res = await handleProxy(client_req, client_res, reqInfo);
      if(!!res && !!res.statusCode && res.statusCode >= 400){
        console.log("Bad response:" + JSON.stringify(res));
      }

      if (!!res && !!res.statusCode){
        return {
          isBase64Encoded: false,
          statusCode: res.statusCode,
          headers: res.headers,
          body: res.body
        };
      }
    } catch ( ex ) {
      console.error("unhandledException: " + ex.message);
      console.error(ex.stack);

      return {
        statusCode: 500,
        body: "Internal server error"
      };
    }
};

const https = require('https');
async function handleProxy(request, response, reqInfo, retrying){
  const fetchUrl = parseUrl(`${OpenAIBaseUrl}${reqInfo.path}${buildQueryString(reqInfo.query)}`);
  try{
    request.headers.host = fetchUrl.host;
    delete request.headers["authorization"];
    var options = {
      hostname: request.headers.host,
      port: 443,
      path: fetchUrl.path + fetchUrl.query,
      method: request.method,
      headers: {
        ...(OpenAIBearerToken && {
          "Authorization": OpenAIBearerToken,
        }),
        ...(OpenAIOrgID && {
          "OpenAI-Organization": OpenAIOrgID,
        }),
        ...(Entrypoint_Token && {
          "x-entrypoint-token": Entrypoint_Token,
        }),
        ...request.headers
      },
      protocol: "https:",
      timeout: 58000
    };
  
    var proxy = https.request(options, function (res) {
      response.writeHead(res.statusCode, res.headers)
      res.pipe(response, {
        end: true
      });
    });
  
    request.pipe(proxy, {
      end: true
    });
  }catch(ex){
    const recoverableErrors = ['ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
    if (recoverableErrors.indexOf(ex.code) > -1 ){
      if (!retrying){
        console.log(`Error '${ex.code}', retrying...`);
        await sleep(1000 + Math.floor(Math.random() * 1500));
        return await handleProxy(request, response, reqInfo, true);
      }else{
        console.log(`Error '${ex.code}', error in a retry, giving up.`);
        throw ex;
      }
    }else{
      console.log(`Error '${ex.code}', not recoverable.`);
      throw ex;
    }
  }
}

function parseUrl(url){
  const indexOfHost = url.indexOf("//") + 2;
  let indexOfPath = indexOfHost + url.substr(indexOfHost).indexOf("/");
  let indexOfQuery = url.lastIndexOf("?");

  if (indexOfPath === -1){
    indexOfPath = url.length;
  }
  if (indexOfQuery === -1){
    indexOfQuery = url.length;
  }

  return {
    host: url.substr(indexOfHost, indexOfPath - indexOfHost), 
    path: url.substr(indexOfPath, indexOfQuery - indexOfPath),
    query: url.substr(indexOfQuery)
  }
}

function buildQueryString(queryStringParameters){
  let hasKeys = false;
  let arr = [];
  for (const key in queryStringParameters){
    hasKeys = true;
    arr.push( encodeURIComponent(key) + '=' + encodeURIComponent(queryStringParameters[key]) );
  }

  if (hasKeys) {
    return "?" + arr.join("&")
  } else {
    return ""
  }
}


process.on('uncaughtException', function(err){
  console.error('uncaughtException causing crash: ' + err.message);
  console.error(err.stack);
});