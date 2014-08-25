'use strict';

var di = require('di');
var fs = require('fs');

var Logger = require('./logger');
var PrismUtils = require('./prism-utils');
var ResponseHash = require('./response-hash');
var ResponseDelay = require('./response-delay');

function Mock(logger, prismUtils, responseHash, responseDelay) {

  function getMockPath(req, res, prism) {
    var path = responseHash.getMockPath(prism, req);

    fs.exists(path, function(exists) {
      if (exists) {
        mockResponse(path, prism, req, res);
      } else {
        write404(req, res, path);
        serializeEmptyMock(prism, req, path);
        logger.verboseLog('Returned 404 for: ' + req.url);
      }
    });
  }

  function mockResponse(path, prism, req, res) {
    /* delay response with some fake time so mock has behaviour like real world API */
    var scheduleResponse = responseDelay.delayTimeInMs(prism.config.delay);
    setTimeout(function() {
      writeResponse(path, res);
      if (scheduleResponse > 0) {
        logger.verboseLog('Mock response delayed by ' + scheduleResponse + ' ms for: ' + req.url);
      }
      logger.log('Dispatching request ' + req.url + ' from ' + path);
      logger.logSuccess('Mocked', req, prism);
    }, scheduleResponse);
  }

  // TODO: figure out how to buffer file stream into response
  function writeResponse(path, res) {
    var responseStr = fs.readFileSync(path).toString();
    var response = JSON.parse(responseStr);

    res.writeHead(response.statusCode, {
      'Content-Type': response.contentType
    });

    var data = response.data;
    if (typeof data === 'object') {
      data = JSON.stringify(data);
    }

    res.write(data);
    res.end();
  }

  function write404(req, res, path) {
    res.writeHead(404, {
      'Content-Type': 'text/plain'
    });
    res.write('No mock exists for ' + req.url + ' - (' + path + ')');
    res.end();
  }


  // TODO: re-factor to remove dupe in mock.js, record.js
  function writeMockToDisk(response, path) {
    var serializedResponse = JSON.stringify(response, true, 2);

    // write file async to disk.  overwrite if it already exists.  prettyprint.
    fs.writeFile(path, serializedResponse);
  }

  function serializeEmptyMock(prism, req, path) {
    var response = {
      requestUrl: req.url,
      contentType: 'application/javascript',
      statusCode: 200,
      data: {}
    };

    path += '.404';

    writeMockToDisk(response, path);
    logger.log('Serialized empty 404 response for ' + req.url + ' to ' + path);
  }

  this.handleRequest = function(req, res, prism) {
    if (prism.config.hashFullRequest) {
      responseHash.getBody(req, function() {
        getMockPath(req, res, prism)
      });
    } else {
      getMockPath(req, res, prism);
    }
  };
}

di.annotate(Mock, new di.Inject(Logger, PrismUtils, ResponseHash, ResponseDelay));

module.exports = Mock;