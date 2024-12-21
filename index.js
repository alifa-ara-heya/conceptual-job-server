const express = require('express')
const cors = require('cors')

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const port = process.env.PORT || 5000
const app = express()

app.use(cors(
  {
    origin: [
      'http://localhost:5173',

    ],
    credentials: true,
    optionsSuccessStatus: 200
  }
));
app.use(express.json())

// cookie parser middleware
app.use(cookieParser());

// custom middleware
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;
  // console.log('token inside the verifyToken', token);

  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }

  //verify the token
  //Make sure ACCESS_TOKEN_SECRET is also added to your .env file
  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Token verification failed: ' + err.message })
    }
    // if there is no error,
    req.user = decoded;
    next();
  })
}

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@main.yolij.mongodb.net/?retryWrites=true&w=majority&appName=Main`

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.kvlax.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const db = client.db('solo-db')
    const jobsCollection = db.collection('jobs')
    const bidsCollection = db.collection('bids');

    //jwt related apis
    app.post('/jwt', (req, res) => {
      const user = req.body;

      //create token

      const token = jwt.sign(user, process.env.SECRET_KEY,
        {
          expiresIn: '365d'
        });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true })
    })

    // removing/clearing the JWT token after the user logs out 
    app.post('/logout', (req, res) => {
      res
        .clearCookie('token', {
          httpOnly: true,
          // maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true })
    })

    // save a jobData in db
    app.post('/add-job', async (req, res) => {
      const jobData = req.body
      const result = await jobsCollection.insertOne(jobData)
      // console.log(result)
      res.send(result)
    })

    // get all jobs data from db
    app.get('/jobs', async (req, res) => {
      const result = await jobsCollection.find().toArray()
      res.send(result)
    })

    // get all jobs advanced
    // AllJobs.jsx
    app.get('/all-jobs', async (req, res) => {
      const filter = req.query.filter  //getting jobs by their category
      const search = req.query.search  //getting jobs by search
      // console.log(search);
      const sort = req.query.sort;
      let options = {} //to sort
      if (sort) options = { sort: { deadline: sort === 'asc' ? 1 : -1 } } //1=ascending, -1=descending
      let query = {
        title: {
          $regex: search,    //regex operator will search everything even if some part of the search parameters matches
          $options: 'i' //this is to search case-insensitive
        }
      }
      if (filter) query.category = filter
      const result = await jobsCollection.find(query, options).toArray();
      res.send(result)

    })


    // get all jobs posted by a specific user
    app.get('/jobs/:email', async (req, res) => {
      const email = req.params.email
      const query = { 'buyer.email': email }
      const result = await jobsCollection.find(query).toArray()
      res.send(result)
    })

    // delete a job from db
    app.delete('/job/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.deleteOne(query)
      res.send(result)
    })

    // get a single job data by id from db
    app.get('/job/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await jobsCollection.findOne(query)
      res.send(result)
    })

    // save a jobData in db
    app.put('/update-job/:id', async (req, res) => {
      const id = req.params.id
      const jobData = req.body
      const updated = {
        $set: jobData,
      }
      const query = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const result = await jobsCollection.updateOne(query, updated, options)
      console.log(result)
      res.send(result)
    })



    // bid related apis

    // save a bidData in db
    //jobDetail.jsx
    app.post('/add-bid', async (req, res) => {
      const bidData = req.body;

      // 0. check if a user has already bided for this job
      const query = { email: bidData.email, jobId: bidData.jobId }
      const alreadyExist = await bidsCollection.findOne(query);
      if (alreadyExist)
        return res.status(400).send('You have already placed a bid for this job.')

      // 1. save data in bids collection
      const result = await bidsCollection.insertOne(bidData);

      // 2. increase bid count in jobs collection
      const filter = { _id: new ObjectId(bidData.jobId) } //who will be updated?
      const update = {
        $inc: { bid_count: 1 }
      }
      const updateBidCount = await jobsCollection.updateOne(filter, update)
      // console.log(result)
      res.send(result)
    })

    /* //get all bids for a specific user (আমি কোন কোন জবে বিড করছি)
    // MyBids.jsx
    app.get('/bids/:email', async (req, res) => {
      const email = req.params.email
      const query = { email }
      const result = await bidsCollection.find(query).toArray()
      res.send(result)
    })

    // get all bid requests for a specific job poster(আমার জব পোস্টে কে কে বিড করছে)
    // BidRequests.jsx
    app.get('/bid-requests/:email', async (req, res) => {
      const email = req.params.email
      const query = { buyer: email }
      const result = await bidsCollection.find(query).toArray()
      res.send(result)
    }) */

    // উপরের দুইটা কোডকে সংক্ষেপে নিচের মতো লিখা যায়
    app.get('/bids/:email', verifyToken, async (req, res) => {
      const isBuyer = req.query.buyer
      const email = req.params.email
      let query = {}
      if (isBuyer) {
        query.buyer = email
      } else {
        query.email = email
      }

      //if token email is not equal to query email
      if (req.user.email !== req.params.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const result = await bidsCollection.find(query).toArray()
      res.send(result)
    })

    // update bidRequests status
    // BidRequests.jsx and MyBids.jsx

    app.patch('/bid-status-update/:id', async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      // return console.log(status);
      const filter = { _id: new ObjectId(id) } //কাকে আপডেট করব
      const updated = {
        $set: { status } //{ status : status} and {status} same
      }
      const result = await bidsCollection.updateOne(filter, updated)
      res.send(result)

    })

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)
app.get('/', (req, res) => {
  res.send('Hello from SoloSphere Server....')
})

app.listen(port, () => console.log(`Server running on port ${port}`))
