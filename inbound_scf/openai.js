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

module.exports.main = async function (req) {
    try {
      console.log("Clinet Request: " + JSON.stringify(req));
      const res = await handleProxy(req)
      return {
        isBase64Encoded: false,
        statusCode: res.statusCode,
        headers: res.headers,
        body: res.body
      };
    } catch ( ex ) {
      console.error("unhandledException: " + ex.message);
      console.error(ex.stack);

      return {
        statusCode: 500,
        body: "Internal server error"
      };
    }
};

const requestAsync = require('util').promisify(require("request"));
const base64js = require('base64-js');

async function handleProxy(request){
  let reqBody = request.body;
  
  if ( request.isBase64Encoded ) {
    reqBody = base64js.toByteArray(reqBody.body);
  }

  const openaiPath = request.path.replace("/api/openai", "");
  const fetchUrl = `${OpenAIBaseUrl}${openaiPath}${buildQueryString(request.queryStringParameters)}`;

  const requestOptions = {
    url: fetchUrl,
    method: request.httpMethod,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": request.headers["user-agent"],
      ...(OpenAIBearerToken && {
        "Authorization": OpenAIBearerToken,
      }),
      ...(OpenAIOrgID && {
        "OpenAI-Organization": OpenAIOrgID,
      }),
      ...(Entrypoint_Token && {
        "x-entrypoint-token": Entrypoint_Token,
      }),
    },
    body: reqBody || null,
    timeout: 10000
  };

  console.log("OpenAI Request: " + JSON.stringify(requestOptions));
  const response = await requestAsync(requestOptions);
  delete response.headers["www-authenticate"]

  return {
    isBase64Encoded: false,
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body
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