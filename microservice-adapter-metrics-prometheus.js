'use strict';

const framework = '@microservice-framework';
const Cluster = require(framework + '/microservice-cluster');
const Microservice = require(framework + '/microservice');
const MicroserviceRouterRegister = require(framework + '/microservice-router-register').register;


require('dotenv').config();

const debugF = require('debug');

var debug = {
  log: debugF('microservice-adapter-metrics-prometheus:log'),
  debug: debugF('microservice-adapter-metrics-prometheus:debug')
};


var mservice = new Microservice({
  secureKey: process.env.SECURE_KEY,
  schema: process.env.SCHEMA
});

var mControlCluster = new Cluster({
  pid: process.env.PIDFILE,
  port: process.env.PORT,
  hostname: process.env.HOSTNAME,
  count: process.env.WORKERS,
  callbacks: {
    init: hookInit,
    validate: hookValidate,
    NOTIFY: hookNOTIFY,
    OPTIONS: mservice.options
  }
});



/**
 * Validate handler.
 */
function hookValidate(method, jsonData, requestDetails, callback) {
  // Ignore access token
  if (requestDetails.headers.access_token) {
    delete requestDetails.headers.access_token
  }
  if (requestDetails.headers['access-token']) {
    delete requestDetails.headers['access-token']
  }
  if (requestDetails.headers['x-hook-signature']) {
    requestDetails.headers.signature = requestDetails.headers['x-hook-signature']
  }
  // use POST validation method.
  return mservice.validate('POST', jsonData, requestDetails, callback);
}

/**
 * Init Handler.
 */
function hookInit(cluster, worker, address) {
  if (worker.id == 1) {
    var mserviceRegister = new MicroserviceRouterRegister({
      server: {
        url: process.env.ROUTER_URL,
        secureKey: process.env.ROUTER_SECRET,
        period: process.env.ROUTER_PERIOD,
      },
      route: {
        type: 'hook',
        hook: [{
          phase: 'after',
          type: 'adapter',
          group: process.env.GROUP
        }],
        conditions: {
          headers:[{
            name: 'user-agent',
            value: 'Prometheus',
            isRegex: true,
          }],
          methods: ['GET']
        },
        path: [process.env.SELF_PATH],
        url: process.env.SELF_URL,
        secureKey: process.env.SECURE_KEY,
        online: true
      },
      cluster: cluster
    });
  }
}


/**
 * Proxy POST requests.
 */
function hookNOTIFY(jsonData, requestDetails, callback) {
  try {
    mservice.validateJson(jsonData);
  } catch (e) {
    return callback(e, null);
  }
  let answer = ''
  let metricNameTotal = 'mfwapi_requests_total'
  answer += '#HELP ' + metricNameTotal + ' The total numbers of mfwapi requests' + "\n"
  answer += '#TYPE ' + metricNameTotal + ' counter' + "\n"
  for (let name in jsonData) {
    for (let method in jsonData[name].methods) {
      for (let code in jsonData[name].methods[method]) {
        let stats = jsonData[name].methods[method][code]
        let statLine = metricNameTotal + '{'
          + ',path="' + name + '"'
          + ',method="' + method + '"'
          + ',code="' + code + '"'
          + '} ' + stats.counter + "\n";
        answer += statLine
      }
    }
  }

  let metricNameDruation = 'mfwapi_requests_duration'
  answer += '#HELP ' + metricNameDruation + ' The duration of mfwapi requests' + "\n"
  answer += '#TYPE ' + metricNameDruation + ' counter' + "\n"
  for (let name in jsonData) {
    for (let method in jsonData[name].methods) {
      for (let code in jsonData[name].methods[method]) {
        let stats = jsonData[name].methods[method][code]
        let statLineMin = metricNameDruation + '{'
          + ',path="' + name + '"'
          + ',method="' + method + '"'
          + ',code="' + code + '"'
          + ',type="min"'
          + '} ' + stats.time.min + "\n";
        answer += statLineMin
        let statLineMax = metricNameDruation + '{'
          + ',path="' + name + '"'
          + ',method="' + method + '"'
          + ',code="' + code + '"'
          + ',type="max"'
          + '} ' + stats.time.max + "\n";
        answer += statLineMax
        let statLineTotal = metricNameDruation + '{'
          + ',path="' + name + '"'
          + ',method="' + method + '"'
          + ',code="' + code + '"'
          + ',type="total"'
          + '} ' + stats.time.total + "\n";
        answer += statLineTotal
        let statLineAVG = metricNameDruation + '{'
          + ',path="' + name + '"'
          + ',method="' + method + '"'
          + ',code="' + code + '"'
          + ',type="avg"'
          + '} ' + (stats.time.total / stats.counter) + "\n";
        answer += statLineAVG
      }
    }
  }

  callback(null, {code: 200, answer: answer, headers: {'x-set-content-type': 'text/plain'}})
}
