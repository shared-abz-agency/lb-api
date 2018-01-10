/* eslint-disable */
const rewiremock = require('rewiremock');
const {
  importTestDataToRedis,
  removeTestDataFromRedis,
  waitForRedis,
} = require('./import.utils');

// Since API use "memored" which depends on "cluster" (master, forks) node module,
// we can't test it, so we need to mock some "memored" functions
const apiInstance = rewiremock.default.proxy('../start', r => ({
  memored: {
    read: (data, cb) => cb(null),
    store: (key, value, number, cb) => cb(null),
  },
}));

const supertest = require('supertest');
const { expect } = require('chai');
const { sendSupertestRequest, parseHTMLResponse } = require('./utils');
let server;
let serverInstance;
let request;

const UNSUPPORTED_DOMAIN = 'someunsopporteddomain.com';
const MAX_REQUEST_COUNT = 6;
const GERMAN_IP = '84.180.213.142';
const GERMAN_IP2 = '84.180.213.143';
const RANDOM_IP = '123.123.21.23';

const TEST_EXCEED_DOMAIN_PAIR = {
  ip: '10.10.20.20',
  domain: 'otto.de',
};

describe('Tests for /get-proxy endpoint', () => {
  before(async () => {
    await waitForRedis();
    await removeTestDataFromRedis();
    await importTestDataToRedis();
    server = apiInstance();
    serverInstance = server.listen();
    request = supertest.agent(serverInstance);
  });

  after(async () => {
    await removeTestDataFromRedis();
    serverInstance.close();
  });

  it('Should throw an error when there is no GET parameters in request', done => {
    request
      .get('/get-proxy')
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.eql({
          error: { type: 1, message: 'Domain not supported' },
        });
        done();
      });
  });

  it('Should throw an error when there is no GET parameters in request in JSON format', done => {
    request
      .get('/get-proxy?json=true')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        expect(res.body).to.eql({
          error: { type: 1, message: 'Domain not supported' },
        });
        done();
      });
  });

  it('Should throw an error when current domain is not supported', done => {
    request
      .get(`/get-proxy?domain=${UNSUPPORTED_DOMAIN}`)
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.eql({
          error: { type: 1, message: 'Domain not supported' },
        });
        done();
      });
  });

  it('Should throw an error when current domain is not supported in JSON format', done => {
    request
      .get(`/get-proxy?domain=${UNSUPPORTED_DOMAIN}&json=true`)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        expect(res.body).to.eql({
          error: { type: 1, message: 'Domain not supported' },
        });
        done();
      });
  });

  it(`Should return an error if current ip/domain is exceed (request count for /get-proxy?domain=\${domain} 
      is more than "request count" property in Defaults settings)`, done => {
    request
      .get(
        `/get-proxy?domain=${TEST_EXCEED_DOMAIN_PAIR.domain}&ip=${
          TEST_EXCEED_DOMAIN_PAIR.ip
        }`
      )
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.eql({
          error: {
            message:
              'Fair use of our service for this website has been exceeded',
            type: 3,
          },
        });
        done();
      });
  });

  it(`Should return an error if current ip/domain is exceed (request count for /get-proxy?domain=\${domain} 
      is more than "request count" property in Defaults settings IN JSON)`, done => {
    request
      .get(
        `/get-proxy?domain=${TEST_EXCEED_DOMAIN_PAIR.domain}&ip=${
          TEST_EXCEED_DOMAIN_PAIR.ip
        }&json=true`
      )
      .expect(200)
      .end((err, res) => {
        expect(res.body).to.eql({
          error: {
            message:
              'Fair use of our service for this website has been exceeded',
            type: 3,
          },
        });
        done();
      });
  });

  it(`Should always return proxy for addedManually domain (youtube/pandora for example)`, done => {
    request
      .get('/get-proxy?domain=www.youtube.com')
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        // expect(result).to.eql(DEFAULT_EXPECTED_PROXY);
        expect(result).to.have.keys(['proxy']);
        done();
      });
  });

  it(`Should always return proxy for addedManually domain (youtube/pandora for example) IN JSON`, done => {
    request
      .get('/get-proxy?domain=www.youtube.com')
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        //expect(result).to.eql(DEFAULT_EXPECTED_PROXY);
        expect(result).to.have.keys(['proxy']);
        done();
      });
  });

  it(`Should return "Unsupported GET" error for not "addedManually" domain 
      (amazon.de for example)`, async () => {
    const expectedResult = {
      error: {
        message: 'Unsupported user GEO',
        type: 2,
      },
    };
    const htmlResponse = await sendSupertestRequest(
      request,
      `/get-proxy?domain=amazon.de&ip=${RANDOM_IP}`
    );
    const jsonResponse = await sendSupertestRequest(
      request,
      `/get-proxy?domain=amazon.de&json=true&ip=${RANDOM_IP}`
    );
    expect(parseHTMLResponse(htmlResponse.text)).to.deep.equal(expectedResult);
    expect(jsonResponse.body).to.eql(expectedResult);
  });

  it(`Should return 302 Redirect after ${MAX_REQUEST_COUNT} requests for not manually added
      domain from same IP address`, async () => {
    try {
      const arr = Array.from({ length: MAX_REQUEST_COUNT });
      for (const item in arr) {
        // async functions in sequence
        await sendSupertestRequest(
          request,
          `/get-proxy?domain=amazon.de&ip=${GERMAN_IP}`,
          50
        );
      }
    } catch (error) {
      throw error;
    }
    return new Promise(resolve => {
      request
        .get(`/get-proxy?domain=amazon.de&ip=${GERMAN_IP}`)
        .end((err, res) => {
          expect(res.status).to.equal(302);
          expect(res.headers.location).to.equal('https://xml-api.herokuapp.com/?pid=1237&psubid=GC&d=amazon.de');
          resolve();
        });
    });
  });

  it(`Should return correct proxy for subdomains (video.youtube.com for instance)`, done => {
    request
      .get(`/get-proxy?domain=subdomain.amazon.de&ip=${GERMAN_IP2}`)
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.have.keys(['proxy']);
        done();
      });
  });

  it(`Should correct handle "www" prefix for auto domains `, done => {
    request
      .get('/get-proxy?domain=www.youtube.com')
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.have.keys(['proxy']);
        request
          .get('/get-proxy?domain=www.pandora.com')
          .expect(200)
          .end((err, res) => {
            let result = parseHTMLResponse(res.text);
            expect(result).to.have.keys(['proxy']);
            done();
          });
      });
  });
});
