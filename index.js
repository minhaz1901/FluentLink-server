const express = require('express');
const app = express();
const cors = require('cors');
//const jwt = require('jsonwebtoken');
require('dotenv').config()
//const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());



const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ib8fgeo.mongodb.net/?retryWrites=true&w=majority`;



app.get('/', (req, res) => {
    res.send('FluentLink is active')
  })
  
  app.listen(port, () => {
    console.log(`FluentLink is running on port ${port}`);
  })
  