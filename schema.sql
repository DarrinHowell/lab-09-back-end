DROP TABLE IF EXISTS location;
DROP TABLE IF EXISTS weather;
-- DROP TABLE IF EXISTS yelp;
-- DROP TABLE IF EXISTS movies;

CREATE TABLE location(
    id SERIAL PRIMARY KEY,
    search_query VARCHAR(255),
    formatted_query VARCHAR(255),
    latitude NUMERIC(8,6),
    longitude NUMERIC(9,6)
);

CREATE TABLE weather(
    id SERIAL PRIMARY KEY,
    forecast VARCHAR(255),
    time VARCHAR(255),
    location_id INTEGER NOT NULL REFERENCES location(id)
);