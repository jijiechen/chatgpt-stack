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

module.exports.main = async function (client_req, client_res, reqInfo) {
  try {
    console.log("Client request:" + JSON.stringify(reqInfo));
    const res = await handleRequest(client_req, client_res, reqInfo);
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

    // response was streamed, don't return explicitly
    return null;
  }catch ( ex ) {
    console.error("unhandledException: " + ex.message);
    console.error(ex.stack);

    return {
      statusCode: 500,
      body: "Internal server error"
    };
  }
};


async function handleRequest(request, response, reqInfo) {
  let path = reqInfo.path;

  switch(path){
    case '/v1/chat/completions':
      path="chat/completions";
      return await handleProxy(request, response, path, false);
    case '/v1/completions':
      path="completions"
      return await handleProxy(request, response, path, false);
    case '/v1/models':
      return handleModels(request)
    default:
      return {
        statusCode: 404,
        body: `no resource found at ${request.url}`
      };
  }
}


const https = require('https');
async function handleProxy(request, response, pathRewrite, retrying){
  let modelName = request.headers["x-model-name"];
  let deployName= modelMapping[modelName] || '';
  if (!deployName) {
    return {
      statusCode: 400,
      body: `unsupported model ${modelName}`
    };
  }
  
  try{
    delete request.headers["x-model-name"];
    request.headers.host = `${AzureAPIResourceName}.openai.azure.com`;
    var options = {
      hostname: request.headers.host,
      port: 443,
      path: `/openai/deployments/${deployName}/${pathRewrite}?api-version=${AzureApiVersion}`,
      method: request.method,
      headers: {
        "api-key": AzureAPIKey,
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
        return await handleProxy(request, response, pathRewrite, true);
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

process.on('uncaughtException', function(err){
  console.error('uncaughtException causing crash: ' + err.message);
  console.error(err.stack);
});