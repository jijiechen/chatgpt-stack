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
  'gpt-3.5-turbo-0301': "",    // DEPLOY_NAME_GPT35_0301,
  'gpt-4': ""             // DEPLOY_NAME_GPT4
};

if (!!process.env.DEPLOY_NAME_GPT35){
  modelMapping["gpt-3.5-turbo"] = process.env.DEPLOY_NAME_GPT35;
}
if (!!process.env.DEPLOY_NAME_GPT35_0301){
  modelMapping["gpt-3.5-turbo-0301"] = process.env.DEPLOY_NAME_GPT35_0301;
}
if (!!process.env.DEPLOY_NAME_GPT4){
  modelMapping["gpt-4"] = process.env.DEPLOY_NAME_GPT4;
}

const allowed_codes = readAccessCodes();

module.exports.main = async function (req) {
  try {
    let accessCode = "";
    if (!!req.headers["authorization"] && req.headers["authorization"].startsWith("Bearer ak-")){
      accessCode = req.headers["authorization"].substr("Bearer ak-".length)
    }

    if (!!allowed_codes){
      if (!accessCode || !allowed_codes[accessCode]){
        console.log("Access denied!");

        return {
          statusCode: !accessCode ? 401 : 403,
          isBase64Encoded: false,
          body: !accessCode ? "UnAuthorized" : `Code '${accessCode}' not allowed.`
        };
      }
      console.log("Client user:" + allowed_codes[accessCode]);
    }else{
      console.log("Auth disabled");
      readAccessCodes();
    }

    const res = await handleRequest(req);
    if(res.statusCode && res.statusCode >= 400){
      console.log("Client request:" + JSON.stringify(req));
      console.log("Bad response:" + JSON.stringify(res));
    }

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
      return await handleProxy(request, path, false);
    case '/v1/completions':
      path="completions"
      return await handleProxy(request, path, false);
    case '/v1/models':
      return handleModels(request)
    default:
      return {
        statusCode: 404,
        body: `no resource found at ${request.path}`
      };
  }
}


const requestAsync = require('util').promisify( require('request') );
const base64js = require('base64-js');

async function handleProxy(request, pathRewrite, retrying){
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

  try{
    const response = await requestAsync(requestOptions);
    const resp = {
      statusCode: response.statusCode,
      headers: response.headers,
      body: response.body
    };
    return resp;
  }catch(ex){
    const recoverableErrors = ['ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED'];
    if (recoverableErrors.indexOf(ex.code) > -1 ){
      if (!retrying){
        console.log(`Error '${ex.code}', retrying...`);
        await sleep(1000 + Math.floor(Math.random() * 1500));
        return await handleProxy(request, pathRewrite, true);
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


async function handleModels(request) {
  const modelList = {
    "object": "list",
    "data": []  
  };

  for (let key in modelMapping) {
    if(!modelMapping[key]){
      continue;
    }

    modelList.data.push({
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

  const json = JSON.stringify(modelList, null, 2);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: json
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

process.on('uncaughtException', function(err){
  console.error('uncaughtException causing crash: ' + err.message);
  console.error(err.stack);
});