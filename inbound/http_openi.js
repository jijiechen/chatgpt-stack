'use strict';

let OpenAIBaseUrl = "https://api.openai.com"
let OpenAIOrgID = "<>"
let OpenAIBearerToken = "Bearer <>"
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


let auth = null;
let allowed_users = [];
if (!!process.env.TCB_ENV_ID){
  const tcb = require('@cloudbase/node-sdk');
  const app = tcb.init({ env: process.env.TCB_ENV_ID });
  auth = app.auth();

  if (!!process.env.USER_LIST){
    allowed_users = process.env.USER_LIST.split(",")
  }
}


module.exports.main = async function (req) {
    try {
      console.log("Requesting: " + JSON.stringify(req));
      const {
        openId, //微信openId，非微信授权登录则空
        appId, //微信appId，非微信授权登录则空
        uid, //用户唯一ID
        customUserId //开发者自定义的用户唯一id，非自定义登录则空
      } = auth.getUserInfo();
      console.log("userInfo:", {openId, appId, uid, customUserId});
      if (allowed_users.length > 0 && allowed_users.indexOf(openId) < 0){
        return {
          statusCode: 403,
          body: `user '${openId}' not allowed`
        };
      }

      const res = await handleProxy(req)
      return {
        statusCode: res.status,
        headers: res.headers,
        body: res.body
      };
    }catch ( ex ) {
      console.log("Error: " + ex.toString())
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

  const openaiPath = request.path.replace("/api/openai/", "");
  const fetchUrl = `${OpenAIBaseUrl}/${openaiPath}${buildQueryString(request.queryStringParameters)}`;

  const requestOptions = {
    url: fetchUrl,
    method: request.httpMethod,
    headers: {
      "Content-Type": "application/json",
      Authorization: OpenAIBearerToken,
      ...(OpenAIOrgID && {
        "OpenAI-Organization": OpenAIOrgID,
      }),
      ...(Entrypoint_Token && {
        "X-Entrypoint-Token": Entrypoint_Token,
      }),
    },
    body: reqBody || null,
    timeout: 10000
  };

  const response = await requestAsync(requestOptions);
  delete response.headers["www-authenticate"]
  response.headers["Access-Control-Allow-Origin"]="*";
  return {
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
  }else{
    return ""
  }
}