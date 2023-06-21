'use strict';

const AzureApiVersion="2023-05-15"

// The name of your Azure OpenAI Resource.
let AzureAPIResourceName=""
if (!!process.env.AOAI_RESOURCE_NAME){
  AzureAPIResourceName = process.env.AOAI_RESOURCE_NAME;
}

let AzureAPIKey=""
if (!!process.env.AOAI_KEY){
  AzureAPIKey = process.env.AOAI_KEY;
}

// The deployment name you chose when you deployed the model.
const modelMapping = {
  'gpt-3.5-turbo': "",    // DEPLOY_NAME_GPT35,
  'gpt-4': ""             // DEPLOY_NAME_GPT4
};
if (!!process.env.DEPLOY_NAME_GPT35){
  modelMapping["gpt-3.5-turbo"] = process.env.DEPLOY_NAME_GPT35;
}
if (!!process.env.DEPLOY_NAME_GPT4){
  modelMapping["gpt-4"] = process.env.DEPLOY_NAME_GPT4;
}

let allowed_codes = [];
if (!!process.env.ALLOWED_CODE_LIST){
  allowed_codes = process.env.ALLOWED_CODE_LIST.split(",");
}


module.exports.main = async function (req) {
  try {
    console.log("Clinet Request: " + JSON.stringify(req));
    
    let accessCode = "";
    if (!!req.headers["authorization"] && req.headers["authorization"].startsWith("Bearer ak-")){
      accessCode = req.headers["authorization"].substr("Bearer ak-".length)
    }

    console.log("Client access code:" + accessCode);

    if (allowed_codes.length > 0 && (!accessCode || allowed_codes.indexOf(accessCode) < 0)){
      return {
        statusCode: !accessCode ? 401 : 403,
        isBase64Encoded: false,
        body: !accessCode ? "UnAuthorized" : `Code '${accessCode}' not allowed.`
      };
    }

    const res = await handleRequest(req)
    return {
      isBase64Encoded: false,
      statusCode: res.statusCode,
      headers: res.headers,
      body: res.body
    };
  }catch ( ex ) {
    console.error("unhandledException: " + ex.message);
    console.error(ex.stack);

    return {
      statusCode: 500,
      body: "Internal server error"
    };
  }
};


async function handleRequest(request) {
let path = request.path;
  path = path.replace("/api/azure", "");

  switch(request.path){
    case '/v1/chat/completions':
      path="chat/completions";
      return handleProxy(request, path);
    case '/v1/completions':
      path="completions"
      return handleProxy(request, path);
    case '/v1/models':
      return handleModels(request)
    default:
      return {
        statusCode: 404,
        body: `no resource not found at ${request.path}`
      };
  }
}


const requestAsync = require('util').promisify( require('request') );
const base64js = require('base64-js');

async function handleProxy(request, pathRewrite){
  let reqBody = request.body;
  
  if ( request.isBase64Encoded ) {
    reqBody = base64js.toByteArray(reqBody.body);
  }

  let modelName = '';
  let deployName='';
  if (!!reqBody){
    const body = JSON.parse(reqBody);
    modelName = body && body.model;  
    deployName = modelMapping[modelName] || '';
  }

  if (!deployName) {
    return {
        statusCode: 400,
        body: `unsupported model ${modelName}`
    };
  }

  const fetchUrl = `https://${AzureAPIResourceName}.openai.azure.com/openai/deployments/${deployName}/${pathRewrite}?api-version=${AzureApiVersion}`
  const requestOptions = {
    url: fetchUrl,
    method: request.httpMethod,
    headers: {
      "Content-Type": "application/json",
      "api-key": AzureAPIKey,
    },
    body: reqBody,
    timeout: 20000
  };

  console.log("Azure OpenAI Request: " + JSON.stringify(requestOptions));
  const response = await requestAsync(requestOptions);
  const resp = {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body
  };
  console.log("Azure OpenAI Response: " + JSON.stringify(resp));
  return resp;
}


async function handleModels(request) {
  const data = {
    "object": "list",
    "data": []  
  };

  for (let key in modelMapping) {
    if(!modelMapping[key]){
      continue;
    }

    data.data.push({
      "id": key,
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai",
      "permission": [{
        "id": "modelperm-M56FXnG1AsIr3SXq8BYPvXJA",
        "object": "model_permission",
        "created": 1679602088,
        "allow_create_engine": false,
        "allow_sampling": true,
        "allow_logprobs": true,
        "allow_search_indices": false,
        "allow_view": true,
        "allow_fine_tuning": false,
        "organization": "*",
        "group": null,
        "is_blocking": false
      }],
      "root": key,
      "parent": null
    });  
  }

  const json = JSON.stringify(data, null, 2);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: json
  };
}


process.on('uncaughtException', function(err){
  console.error('uncaughtException causing crash: ' + err.message);
  console.error(err.stack);
});