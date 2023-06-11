'use strict';

// The name of your Azure OpenAI Resource.
const AzureAPIResourceName=""
const AzureAPIKey=""
// The deployment name you chose when you deployed the model.
const modelMapping = {
  'gpt-3.5-turbo': "",    // DEPLOY_NAME_GPT35,
  'gpt-4': ""             // DEPLOY_NAME_GPT4
};
const AzureApiVersion="2023-05-15"

module.exports.main = async function (req) {
    try {
      console.log("Requesting: " + JSON.stringify(req));

      const res = await handleRequest(req)
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


async function handleRequest(request) {
  let path = request.path;
  path = path.replace("/api/openai", "");

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

const requestAsync = require('util').promisify(require("request"));
const base64js = require('base64-js');

async function handleProxy(request, pathRewrite){
  let reqBody = request.body;
  
  if ( request.isBase64Encoded ) {
    reqBody = base64js.toByteArray(reqBody.body);
  }
  const body = JSON.parse(reqBody)
  const modelName = body?.model;  
  const deployName = modelMapping[modelName] || '' 

  if (deployName === '') {
    return {
        statusCode: 400,
        body: `unsupported model ${$modelName}`
    };
  }

  const fetchUrl = `https://${AzureAPIResourceName}.openai.azure.com/openai/deployments/${deployName}/${pathRewrite}?api-version=${AzureApiVersion}`

  // const authKey = request.headers['Authorization'];
  // if (!authKey) {
  //   return new Response("Not allowed", {
  //     status: 403
  //   });
  // }

  const requestOptions = {
    url: fetchUrl,
    method: request.httpMethod,
    headers: {
      "Content-Type": "application/json",
      "api-key": AzureAPIKey,
    },
    body: typeof body === 'object' ? JSON.stringify(body) : null,
    timeout: 10000
  };


  return {
    statusCode: 200,
    headers:{
      "Content-Type": "text/plain"
    },
    body: "Azure API Request URL: " + fetchUrl + "\n" + "Azure API Request Options:\n" + JSON.stringify(requestOptions)
  }

  const response = await requestAsync(requestOptions);
  delete response.headers["www-authenticate"]
  response.headers["Access-Control-Allow-Origin"]="*";
  return {
    statusCode: response.statusCode,
    headers: response.headers,
    body: response.body
  }
}


async function handleModels(request) {
  const data = {
    "object": "list",
    "data": []  
  };

  for (let key in modelMapping) {
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
