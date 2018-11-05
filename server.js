'use strict';

const express = require('express');
const cors = require('cors');
const superagent = require('superagent');
const pg = require('pg');

require('dotenv').config();

const PORT = process.env.PORT || 3000;

const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err => console.log(err));

const app = express();

app.use(cors());


/*----get functions-----*/



app.get('/location', getLocation)

app.get('/weather', getWeather)

app.get('/yelp', getFood)

app.get('/movies', getMovies);

// app.get('/meetup', getWeather);


/* ------Error Handler-----
Error handler will send an error message when
the server can't handle their input */


function handleError(err, response) {
  console.error('ERR', err);
  if (response) {
    response.status(500).send('Sorry we didn\'t catch that, please try again');
  }
}


/*-------LOCATION--------*/
function Location(query, data) {
  this.search_query = query;
  this.formatted_query = data.formatted_address;
  this.latitude = data.geometry.location.lat;
  this.longitude = data.geometry.location.lng;
}


// in the save, tell SQL to return the ID during an insert.
// send that ID I get back to get lat long / whatever calls the save
// need to add id to location
// send that id back to the client.

// between saving and sending, attach an ID to that location.

// location_id is coming back undefined. Need to add that to our location object.

// does the query have a loction ID?


Location.prototype.save = function(){
  let SQL = `
  INSERT INTO locations
    (search_query,formatted_query,latitude,longitude)
    VALUES($1,$2,$3,$4) RETURNING id`;

  let values = Object.values(this);
  return client.query(SQL, values);
};

// Our refactored getLatLongData code builds a query string and requests data from the GEOCODE API via
// superagent. After that request has been made and Google serves something back to us, our function
// either throws a 'No Data' error if we don't receive data back, or if we receive data back, we
// create a new location object and save that object to SQL. Finally we send that location data
// back to get the getLocation function, ultimately sending the data to the front end.
Location.getLatLongData = (query) => {
  const googleData = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(googleData)
    .then(data => {
      if (!data.body.results.length) {
        throw 'No Data';
      } else {
        let location = new Location(query, data.body.results[0]);
        return location.save()
          .then(results => {
            // console.log('THESE are our new results: ', results);
            location.id=results.rows[0].id
            return location;
          })
      }
    })
    .catch(error => handleError(error));
};

// Our refactored getLocation function recieves a request and a response from the express get() function
// in which this callback is nested.
// a location hanler object is then instantiated with a query property, a cacheHit function, and a
// cacheMiss function. This function then sends the locationHandler to a lookupLocation function
// outlined below.
function getLocation(req, res){
  const locationHandler = {
    query: req.query.data,

    cacheHit: (results) => {
      console.log('Got Data From SQL');
      res.send(results.rows[0]);
    },

    cacheMiss: () => {
      Location.getLatLongData(req.query.data)
        .then(data => res.send(data));
      console.log('Got Data from API');
    },

  };
  Location.lookupLocation(locationHandler);
}

// This method takes in a locationHandler object as outlined above in getLocation.
// This funciton creates an SQL query via pg's client object that checks if the data from the front end
// query matches any data in our SQL database.
// After waiting to hear back from the postgres SQL query, if the results come back with database with any rows
// we call the cacheHit function from our handler and send data back to the front end. (This conditional)
// is effective because location is the first query made and therefore should be the first and only row
// in our database.
// If we do not come back with a database that has any location data, we invoke cache.Miss from our handler
// object and perform a query to the Google GEOCODE API.
Location.lookupLocation = (handler) => {
  const SQL = 'SELECT * FROM locations WHERE search_query=$1';
  const values = [handler.query];

  return client.query(SQL, values)
    .then(results => {
      if(results.rowCount > 0){
        handler.cacheHit(results);
      }else{
        handler.cacheMiss();
      }
    })
    .catch(console.error);
};




/*--------WEATHER-------*/
// Refactored this.time to use the toDateString() to parse the object data//
function Weather(data) {
  let day = new Date(data.time * 1000);
  this.time = day.toDateString().slice(0,15);
  this.forecast = data.summary;
}

Weather.prototype.save = function(id){
  let SQL = `
  INSERT INTO weather
    (forecast, time, location_id)
    VALUES($1,$2,$3)`;

  let values = Object.values(this);
  values.push(id)
  client.query(SQL, values);
};

Weather.lookup = function(handler){
  const SQL = 'SELECT * FROM weather WHERE location_id=$1';
  client.query(SQL,[handler.id])
    .then(results => {
      if(results.rowCount > 0){
        console.log('Got weather data from SQL');
        handler.cacheHit(results);
      }else{
        console.log('Got weather data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};



Weather.searchWeather = function(query) {
  const darkSkyData = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.data.latitude},${query.data.longitude}`;

  return superagent.get(darkSkyData)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        const summary = new Weather(day);
        summary.save(query.data.id);
        return summary;
      });
      return weatherSummaries;
    })
    .catch(error => handleError(error));
};

function getWeather(req, res){
  console.log('this is our req.query.data --> ', req.query.data);
  const weatherHandler = {
    id:req.query.data.id,
    cacheHit: function(result){
      res.send(result.rows);
    },
    cacheMiss: function() {
      Weather.searchWeather(req.query)
        .then(results => res.send(results))
        .catch(console.error);
    },
  };
  Weather.lookup(weatherHandler);
}




//------Yelp--------//

function getFood(req, res){
  const foodHandler = {
    id:req.query.data.id,
    cacheHit: function(result){
      res.send(result.rows);
    },
    cacheMiss: function() {
      Food.searchFood(req.query.data)
        .then(results => res.send(results))
        .catch(console.error);
    }
  };
  Food.lookup(foodHandler);
}

Food.lookup = function(handler){
  const SQL = 'SELECT * FROM yelp WHERE location_id=$1';
  client.query(SQL,[handler.id])
    .then(results => {
      if(results.rowCount > 0){
        console.log('Got yelp data from SQL');
        handler.cacheHit(results);
      }else{
        console.log('Got yelp data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

Food.searchFood = function (query){
  const _yelpURL = `https://api.yelp.com/v3/businesses/search?latitude=${query.latitude}&longitude=${query.longitude}`;
  return superagent.get(_yelpURL)
    .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
    .then(result => {
      let parsedData = JSON.parse(result.text);
      let restaurantData = parsedData.businesses.map(restaurantArr => {
        let yelpData = new Food(restaurantArr.name, restaurantArr.image_url,
          restaurantArr.price, restaurantArr.rating,
          restaurantArr.url);
        yelpData.save(query.id);
        return yelpData;
      });
      return restaurantData;
    })
    .catch(error => handleError(error));
}


function Food(name, image_url, price, rating, url){
  this.name = name;
  this.image_url = image_url;
  this.price = price;
  this.rating = rating;
  this.url = url;
}

Food.prototype.save = function(id){
  let SQL = `
  INSERT INTO yelp
    (name, image_url, price, rating, url, location_id)
    VALUES($1,$2,$3,$4,$5,$6)`;
  let values = Object.values(this);
  values.push(id)
  client.query(SQL, values);
};


//--------Movies-------//

//Follow the same pattern as searchFood
//query for movies includes the API key inside the URL.  no need for .set like in YELP.
//we then use superagent .get to recieve data from the API by feeding that URL that's assigned to movieData variable.
//We then normalize the data.  Then send it back to the front-end after returning to our app .get query.

function getMovies(req, res){
  const movieHandler = {
    id:req.query.data.id,
    cacheHit: function(result){
      res.send(result.rows);
    },
    cacheMiss: function() {
      Movie.searchMovies(req.query.data)
        .then(results => res.send(results))
        .catch(console.error);
    }
  };
  Movie.lookup(movieHandler);
}

Movie.lookup = function(handler){
  const SQL = 'SELECT * FROM movies WHERE location_id=$1';
  client.query(SQL,[handler.id])
    .then(results => {
      if(results.rowCount > 0){
        console.log('Got movie data from SQL');
        handler.cacheHit(results);
      }else{
        console.log('Got movie data from API');
        handler.cacheMiss();
      }
    })
    .catch(error => handleError(error));
};

Movie.searchMovies = function (query){
  let city = query.formatted_query.split(',')[0];
  const movieData = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${city}`;

  return superagent.get(movieData)
    .then(result => {
      let movieSearch = JSON.parse(result.text);
      let movieList = movieSearch.results.map(movie =>{
        let newMovie = new Movie(movie);
        newMovie.save(query.id)
        return newMovie;
      });
      return movieList;
    })
    .catch(error => handleError(error));
}

function Movie(data){
  this.title = data.title;
  this.overview = data.overview;
  this.average_votes = data.vote_average;
  this.total_votes = data.vote_count;
  this.image_url = `https://image.tmdb.org/t/p/original${data.poster_path}`;
  this.popularity = data.popularity;
  this.released_on = data.release_date;
}
// image url has prepended pathway so the path actually shows image and not just data link

Movie.prototype.save = function(id){
  let SQL = `
  INSERT INTO movies
    (title, overview, average_votes, total_votes, image_url, popularity, released_on, location_id)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8)`;
  let values = Object.values(this);
  values.push(id)
  client.query(SQL, values);
};

app.listen(PORT, () => console.log(`App is up on ${PORT}`));

