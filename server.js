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



app.get('/location', getLocation);

app.get('/weather', getWeather);

// app.get('/yelp', (request, response) => {
//   const yelpData = searchFood(request.query.data)
//     .then(yelpData => response.send(yelpData))
//     .catch(error => handleError(error, response));
// });

// app.get('/movies', (request, response) => {
//   const movieData = searchMovies(request.query.data)
//     .then(movieData => response.send(movieData))
//     .catch(error => handleError(error, response));
// });

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



Location.prototype.save = function(){
  let SQL = `
  INSERT INTO locations
    (search_query,formatted_query,latitude,longitude)
    VALUES($1,$2,$3,$4)`;

  let values = Object.values(this);
  client.query(SQL, values);
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
        location.save();
        return location;
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
  client.query(SQL,[handler.location.id])
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
  const darkSkyData = `https://api.darksky.net/forecast/${process.env.DARKSKY_API_KEY}/${query.latitude},${query.longitude}`;

  return superagent.get(darkSkyData)
    .then(result => {
      const weatherSummaries = result.body.daily.data.map(day => {
        const summary = new Weather(day);
        summary.save(query.id);
        return summary;
      });
      return weatherSummaries;
    })
    .catch(error => handleError(error));
};

function getWeather(req, res){
  const weatherHandler = {
    location: req.query.data,
    cacheHit: function(result){
      res.send(result.rows);
    },
    cacheMiss: function() {
      Weather.searchWeather(req.query.data)
        .then(results => res.send(results))
        .catch(console.error);
    },
  };
  Weather.lookup(weatherHandler);
}




// //------Yelp--------//

// function searchFood(query){
//   const yelpData = `https://api.yelp.com/v3/businesses/search?latitude=${query.latitude}&longitude=${query.longitude}&term="restaurants`;

//   return superagent.get(yelpData)
//   //YELP documentation REQUIRED to have .set with Authorization and 'Bearer' in the process.env API Key
//   //superagent returns the yelp data variable and sets authorization to the template literal.
//   //this is how yelp is feed the key
//   //once we recieve back the results from YELP, we then normalize the data with the object constructor.
//   //Send it back to our app.get function above.  Then send it back to our client.
//     .set('Authorization', `Bearer ${process.env.YELP_API_KEY}`)
//     .then(result => {
//       let search = JSON.parse(result.text);
//       return search.businesses.map(business =>{
//         return new Food(business);
//       });
//     })
//     .catch(error => handleError(error));
// }

// function Food(data){
//   this.name = data.name;
//   this.url = data.url;
//   this.price = data.price;
//   this.image_url = data.image_url;
//   this.rating = data.rating;
// }

// //--------Movies-------//

// //Follow the same pattern as searchFood
// //query for movies includes the API key inside the URL.  no need for .set like in YELP.
// //we then use superagent .get to recieve data from the API by feeding that URL that's assigned to movieData variable.
// //We then normalize the data.  Then send it back to the front-end after returning to our app .get query.
// function searchMovies(query){
//   let city = query.formatted_query.split(',')[0];
//   const movieData = `https://api.themoviedb.org/3/search/movie?api_key=${process.env.MOVIE_API_KEY}&query=${city}`;

//   return superagent.get(movieData)
//     .then(result => {
//       let movieSearch = JSON.parse(result.text);
//       return movieSearch.results.map(movie =>{
//         return new Movie(movie);
//       });
//     })
//     .catch(error => handleError(error));
// }

// function Movie(data){
//   this.title = data.title;
//   this.overview = data.overview;
//   this.average_votes = data.vote_average;
//   this.total_votes = data.vote_count;
//   this.image_url = `https://image.tmdb.org/t/p/original${data.poster_path}`;
//   this.popularity = data.popularity;
//   this.released_on = data.release_date;
// }
//image url has prepended pathway so the path actually shows image and not just data link


app.listen(PORT, () => console.log(`App is up on ${PORT}`));

