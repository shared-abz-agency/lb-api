const rewiremock = require('rewiremock');

// Since API use "memored" which depends on "cluster" (master, forks) node module,
// we can't test it, so we need to mock some "memored" functions
const apiInstance = rewiremock.default.proxy('../start', r => ({
  memored: {
    read: (data, cb) => cb(null),
    store: (key, value, number, cb) => cb(null),
  },
}));
const supertest = require('supertest');
const { expect, assert } = require('chai');
const { parseHTMLResponse } = require('./utils');

let server;
let serverInstance;
let request;

describe('Tests for /config endpoint', () => {
  before(async () => {
    server = apiInstance();
    serverInstance = server.listen();
    request = supertest.agent(serverInstance);
  });

  after(done => {
    serverInstance.close();
    done();
  });

  it('Should throw an error when there is no GET parameters in request', done => {
    request
      .get('/config')
      .expect(200)
      .end((err, res) => {
        const expectedResult = {
          error: {
            message:
              'Required params are missing. Please check if "browser", "locale", "version" are present',
            type: 6,
          },
        };
        let result = parseHTMLResponse(res.text);
        expect(result).to.eql(expectedResult);
        done();
      });
  });

  it('Should return correct config response', done => {
    request
      .get('/config?browser=firefox&version=3.2.1&locale=en')
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        assert.property(result, 'useYouTubeAPI');
        assert.property(result, 'elements');
        assert.isArray(result.elements);
        assert.isArray(result.messages);
        assert.property(result, 'notification');
        assert.property(result, 'proxy');
        assert.isArray(result.settings);
        assert.property(result, 'simpleAssets');
        assert.isArray(result.simpleAssets);
        assert.property(result, 'supportedsites');
        assert.isArray(result.supportedsites);
        done();
      });
  });

  it('Should return correct config response IN JSON format', done => {
    request
      .get('/config?browser=firefox&version=3.2.1&locale=en&json=true')
      .expect(200)
      .end((err, res) => {
        let result = res.body;
        assert.property(result, 'useYouTubeAPI');
        assert.property(result, 'elements');
        assert.isArray(result.elements);
        assert.isArray(result.messages);
        assert.property(result, 'notification');
        assert.property(result, 'proxy');
        assert.isArray(result.settings);
        assert.property(result, 'simpleAssets');
        assert.isArray(result.simpleAssets);
        assert.property(result, 'supportedsites');
        assert.isArray(result.supportedsites);
        done();
      });
  });
});
