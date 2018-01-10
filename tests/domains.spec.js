/* eslint-disable */
const rewiremock = require('rewiremock');
const {
  importTestDataToRedis,
  removeTestDataFromRedis,
  waitForRedis,
} = require('./import.utils');

// Since API use "memored" node module,  which depends on "cluster" (master, forks) node module,
// we can't test it, so we need to mock some "memored" functions
const apiInstance = rewiremock.default.proxy('../start', r => ({
  memored: {
    read: (data, cb) => cb(null),
    store: (key, value, number, cb) => cb(null),
  },
}));

const supertest = require('supertest');
const { expect } = require('chai');
const { generateUID, parseHTMLResponse } = require('./utils');
let server;
let serverInstance;
let request;

// UID which is already stored in Redis and it should have "firstRequestDate"
// more than postpone delivery param in defaults
const OLD_UID = 201;

const GERMAN_IP = '84.180.213.142';
const FRANCE_IP = '11.22.33.44';
const INVALID_IP = '245.245.245.245';

const FULL_DOMAIN_LIST_EXPECTED_RESPONSE = {
  'www.youtube.com': { regex: '.*', xpath: '//*' },
  'www.nbc.com': { regex: '.*', xpath: '//*' },
  'www.fox.com': { regex: '.*', xpath: '//*' },
  'www.pandora.com': { regex: '.*', xpath: '//*' },
  'amazon.de': { regex: '.*', xpath: '//*' },
  'otto.de': { regex: '.*', xpath: '//*' },
};

// since full is not static, most likely 'amazon.de' should be there
const DOMAIN_FORM_FULL_LIST = 'amazon.de';

const SHORT_DOMAIN_LIST_EXPECTED_RESPONSE = {
  'www.fox.com': { regex: '.*', xpath: '//*' },
  'www.pandora.com': { regex: '.*', xpath: '//*' },
  'www.youtube.com': { regex: '.*', xpath: '//*' },
  'www.nbc.com': { regex: '.*', xpath: '//*' },
};

describe('Tests for /domains endpoint', () => {
  before(async () => {
    await waitForRedis();
    await removeTestDataFromRedis();
    await importTestDataToRedis();
    server = apiInstance();
    serverInstance = server.listen();
    request = supertest.agent(serverInstance);
  });

  after(async () => {
    serverInstance.close();
    await removeTestDataFromRedis();
  });

  it('Should throw an error when there is no GET parameters in request', done => {
    request
      .get('/domains')
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.eql({
          error: { type: 5, message: 'UID is missing or incorrect' },
        });
        done();
      });
  });

  it('Should throw an error when there is no GET parameters in request in JSON format', done => {
    request
      .get('/domains?json=true')
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        expect(res.body).to.eql({
          error: { type: 5, message: 'UID is missing or incorrect' },
        });
        done();
      });
  });

  it('Should fetch short list of domains for new UID in HTML format', done => {
    request
      .get(`/domains?uid=${generateUID()}`)
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        done();
      });
  });

  it('Should fetch short list of domains for new UID in JSON format', done => {
    request
      .get(`/domains?uid=${generateUID()}&json=true`)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        expect(res.body).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        done();
      });
  });

  it(`Should fetch full list of domains for UID=${OLD_UID} and real german IP in HTML format`, done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${GERMAN_IP}`)
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        //expect(result).have.all.keys(FULL_DOMAIN_LIST_EXPECTED_RESPONSE);
        expect(result).to.include.keys(DOMAIN_FORM_FULL_LIST);
        done();
      });
  });

  it(`Should fetch full list of domains for UID=${OLD_UID} and real german IP in JSON format`, done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${GERMAN_IP}&json=true`)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        expect(res.body).to.include.keys(DOMAIN_FORM_FULL_LIST);
        done();
      });
  });

  it(`Should fetch short list of domains for UID=${OLD_UID} and not german IP in HTML format`, done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${FRANCE_IP}`)
      .expect(200)
      .end((err, res) => {
        let result = parseHTMLResponse(res.text);
        expect(result).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        done();
      });
  });

  it(`Should fetch short list of domains for UID=${OLD_UID} and not german IP in JSON format`, done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${FRANCE_IP}&json=true`)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        expect(res.body).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        done();
      });
  });

  it(`Should fetch short/full domain list depends on "selfHosted" query param for UID ${OLD_UID}`, done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${GERMAN_IP}&selfHosted=true`)
      .expect(200)
      .end((err, res) => {
        const result = parseHTMLResponse(res.text);
        expect(result).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        request
          .get(`/domains?uid=${OLD_UID}&ip=${GERMAN_IP}&selfHosted=undo`)
          .expect(200)
          .end((err, res) => {
            const result = parseHTMLResponse(res.text);
            expect(result).to.include.keys(FULL_DOMAIN_LIST_EXPECTED_RESPONSE);
            done();
          });
      });
  });

  it(`Should fetch short/full domain list depends on "selfHosted" query param for UID ${OLD_UID} in JSON format`, done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${GERMAN_IP}&selfHosted=true&json=true`)
      .expect(200)
      .expect('Content-Type', /json/)
      .end((err, res) => {
        expect(res.body).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        // 2nd request without selfHosted param should also return short list
        request
          .get(
            `/domains?uid=${OLD_UID}&ip=${GERMAN_IP}&selfHosted=true&json=true`
          )
          .expect(200)
          .expect('Content-Type', /json/)
          .end((err, res) => {
            expect(res.body).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
            // 3th request with "selfHosted=undo" should return FULL list for old uid
            request
              .get(
                `/domains?uid=${OLD_UID}&ip=${GERMAN_IP}&selfHosted=undo&json=true`
              )
              .expect(200)
              .expect('Content-Type', /json/)
              .end((err, res) => {
                expect(res.body).to.include.keys(
                  FULL_DOMAIN_LIST_EXPECTED_RESPONSE
                );
                done();
              });
          });
      });
  });

  it('Should return short list on invalid ip address', done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${INVALID_IP}`)
      .expect(200)
      .end((err, res) => {
        const result = parseHTMLResponse(res.text);
        expect(result).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        done();
      });
  });

  it('Should return short list on invalid ip address in JSON', done => {
    request
      .get(`/domains?uid=${OLD_UID}&ip=${INVALID_IP}&json=true`)
      .expect(200)
      .end((err, res) => {
        expect(res.body).to.eql(SHORT_DOMAIN_LIST_EXPECTED_RESPONSE);
        done();
      });
  });
});
