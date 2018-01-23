# LoadBalancer API

Backend API service for "Proxflow" and "Proxtube" browser extensions

### Installing

Clone repo
Then you have to setup local redis server and run "start.test.redis.sh" 
 to load production dump of redis database
```
npm install
```

```
bash ./start.redis.sh
```

```
npm run start
```

## Running the tests
```
bash ./start.redis.sh
```
```
npm run test
```

## Deployment

Since we are using [Heroku](https://dashboard.heroku.com/) with pipelines, for deployment 
you need to push your changes into master branch, then it should be automatically deployed to staging app
[loadbalancer-api-stage.herokuapp.com](https://loadbalancer-api-stage.herokuapp.com)

## Built With

* [Node.js](https://nodejs.org/en/docs/) - The web framework used
* [NPM](https://www.npmjs.com/) - Dependency Management
* [Redis](https://redis.io/) - Key-value in-memory database


## Authors

* [abz.agency](https://abz.agency)
