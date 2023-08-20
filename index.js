const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000;

// middleware
const corsConfig = {
  origin: '',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE']
}
app.use(cors(corsConfig))
app.options("", cors(corsConfig))
app.use(express.json());


const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'unauthorized access' });
  }

  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ error: true, message: 'unauthorized access' })
    }
    req.decoded = decoded;
    next();
  })
}


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ib8fgeo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {


    const usersCollection = client.db("FluentLink").collection("users");
    const courseCollection = client.db("FluentLink").collection("courses");
    const paymentCollection = client.db("FluentLink").collection("payments");


    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
      res.send({ token })
    })


    // Courses collection apis
    app.get('/courses', async (req, res) => {
      const query = { isPending: false, isDenied: false }
        const result = await courseCollection.find(query).toArray();
        res.send(result);
      })

    app.post('/courses', async (req, res) => {
      const NewCourse = req.body;
      const result = await courseCollection.insertOne(NewCourse);
      res.send(result);
    })

    app.get('/courses/:courseId', async (req, res) => {
      const courseId = req.params.courseId;
      const filter = { _id: new ObjectId(courseId) };
      const result = await courseCollection.findOne(filter);
        res.send(result);
      })


    
    //instructors collection apis
    app.get('/instructors', async (req, res) => {
      try {
          const instructorDataCursor = await courseCollection.aggregate([
              {
                  $group: {
                      _id: {
                          instructor_name: '$instructor_name',
                          instructor_email: '$instructor_email',
                          instructor_photo: '$instructor_photo',
                      },
                      numberOfCourses: { $sum: 1 },
                  },
              },
              {
                  $project: {
                      _id: 0,
                      instructor_name: '$_id.instructor_name',
                      instructor_email: '$_id.instructor_email',
                      instructor_photo: '$_id.instructor_photo',
                      numberOfCourses: 1,
                  },
              },
          ]);
  
          const instructorDataArray = await instructorDataCursor.toArray();
          console.log(instructorDataArray); // Check if you're getting the data in the console
  
          res.json(instructorDataArray);
      } catch (error) {
          console.error(error);
          res.status(500).json({ message: 'Error retrieving instructor information' });
      }
  });
  


    
    // user collection apis
    app.get('/users',  async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ insertedId: true })
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });




    app.get('/users/role/:email', verifyJWT, async (req, res) => {
        const email = req.params.email;
    
        if (req.decoded.email !== email) {
            res.status(403).send({ message: 'Unauthorized' });
            return;
        }
    
        const query = { email: email };
        const user = await usersCollection.findOne(query);
        const result = {
          isAdmin: user?.role === 'admin',
          isInstructor: user?.role === 'instructor'
        };
        console.log(email,user,result);
    
        res.send(result);
    });
    

    app.patch('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'admin'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    });

    app.delete('/users/admin/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });



    app.patch('/users/instructor/:id', async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: 'instructor'
        },
      };

      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);

    })



    // selectedClasses collection apis
    app.get('/selectedClasses/:studentEmail', async (req, res) => {
      try {
        const studentEmail = req.params.studentEmail;
        const query = { selectedByStudent: studentEmail };
        const result = await courseCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });
    
    app.post('/selectedClasses', async (req, res) => {
      try {
        const studentEmail = req.body.studentEmail;
        const classId = req.body.classId;
        console.log(studentEmail, classId);
    
        // Convert classId to ObjectID
        const ObjectId = require('mongodb').ObjectId;
        const selectedClass = await courseCollection.findOne({ _id: new ObjectId(classId) });
    
        if (!selectedClass) {
          return res.status(404).json({ error: 'Class not found' });
        }
    
        // Check if the student has already selected this class
        if (selectedClass.selectedByStudent.includes(studentEmail)) {
          return res.status(400).json({ error: 'Class already selected by this student' });
        }
    
        // Update the selectedByStudent array with the student's email
        selectedClass.selectedByStudent.push(studentEmail);
    
        // Save the updated class
        await courseCollection.updateOne({ _id: new ObjectId(classId) }, { $set: selectedClass });
    
        res.json({ message: 'Class selected successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    app.post('/removeSelectedClass', async (req, res) => {
      try {
        const studentEmail = req.body.studentEmail;
        const classId = req.body.classId;
    
        // Convert classId to ObjectID
        const ObjectId = require('mongodb').ObjectId;
    
        // Find the selected class
        const selectedClass = await courseCollection.findOne({ _id: new ObjectId(classId) });
    
        if (!selectedClass) {
          return res.status(404).json({ error: 'Class not found' });
        }
    
        // Check if the student's email is in the selectedByStudent array
        const studentIndex = selectedClass.selectedByStudent.indexOf(studentEmail);
        if (studentIndex === -1) {
          return res.status(400).json({ error: 'Student email not found in selectedByStudent array' });
        }
    
        // Remove the student's email from the selectedByStudent array
        selectedClass.selectedByStudent.splice(studentIndex, 1);
    
        // Update the class document in the collection
        await courseCollection.updateOne(
          { _id: new ObjectId(classId) },
          { $set: { selectedByStudent: selectedClass.selectedByStudent } }
        );
    
        res.json({ message: 'Student removed from class successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });


    // EnrolledClasses collection apis
    app.get('/enrolledClasses/:studentEmail', async (req, res) => {
      try {
        const studentEmail = req.params.studentEmail;
        const query = { enrolledByStudent : studentEmail };
        const result = await courseCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });
    
    app.post('/enrolledClasses', async (req, res) => {
      try {
        const studentEmail = req.body.studentEmail;
        const classId = req.body.classId;
        console.log(studentEmail, classId);
    
        // Convert classId to ObjectID
        const ObjectId = require('mongodb').ObjectId;
        const selectedClass = await courseCollection.findOne({ _id: new ObjectId(classId) });
    
        if (!selectedClass) {
          return res.status(404).json({ error: 'Class not found' });
        }
    
        // Check if the student has already selected this class
        if (selectedClass.enrolledByStudent.includes(studentEmail)) {
          return res.status(400).json({ error: 'Class already selected by this student' });
        }
    
        // Update the enrolledByStudent array with the student's email
        selectedClass.enrolledByStudent.push(studentEmail);
    
        // Save the updated class
        await courseCollection.updateOne({ _id: new ObjectId(classId) }, { $set: selectedClass });
    
        res.json({ message: 'Class selected successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });



    // MyPendingCourses collection apis allPendingClasses
    app.get('/myPendingClasses/:tEmail', async (req, res) => {
      try {
        const tEmail = req.params.tEmail;
        const query = {
          instructor_email: tEmail,
          $or: [
              { isPending: true },
              { isDenied: true }
          ]
      };
        const result = await courseCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    // MyApprovedCourses collection apis allPendingClasses
    app.get('/myApprovedClasses/:tEmail', async (req, res) => {
      try {
        const tEmail = req.params.tEmail;
        const query = { instructor_email: tEmail, isPending: false, isDenied: false};
        const result = await courseCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    // allPendingClasses collection apis
    app.get('/allPendingClasses', async (req, res) => {
      const query = {$or: [
        { isPending: true },
        { isDenied: true }
    ] } 
        const result = await courseCollection.find(query).toArray();
        res.send(result);
      })

    // approveClasses collection apis
    app.patch('/approveCourse/:courseId', async (req, res) => {
      const courseId = req.params.courseId;

        const filter = { _id: new ObjectId(courseId) };
        // this option instructs the method to create a document if no documents match the filter
        const options = { upsert: false };
        // create a document that sets the plot of the movie
        const updateDoc = { $set: { isPending: false, isDenied: false, admin_feedback:"" } };
        const updatedCourse = await courseCollection.updateOne(filter, updateDoc, options );
        res.send(updatedCourse);
  
    });

    // denyClasses collection apis
    app.patch('/denyCourse/:courseId', async (req, res) => {
      const courseId = req.params.courseId;
      const filter = { _id: new ObjectId(courseId) };
      // this option instructs the method to create a document if no documents match the filter
      const options = { upsert: false };
      // create a document that sets the plot of the movie
      const updateDoc = { $set: { isPending: false, isDenied: true } };
      const updatedCourse = await courseCollection.updateOne(filter, updateDoc, options );
      res.send(updatedCourse);

  });
    // feedback collection apis
    app.put('/feedback/:courseId', async (req, res) => {
      const courseId = req.params.courseId;
      const feedback = req.body.admin_feedback; // Assuming the key in the object is "admin_feedback"
      console.log(feedback);
      const filter = { _id: new ObjectId(courseId) };
      const options = { upsert: true };
      const updateDoc = { $set: { admin_feedback: feedback } };
      const updatedCourse = await courseCollection.updateOne(filter, updateDoc, options );
      res.send(updatedCourse);
  });
  
    
    // create payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })


    // payment related api
    app.get('/payments/:studentEmail', async (req, res) => {
      try {
        const studentEmail = req.params.studentEmail;
        const query = { email: studentEmail };
        const result = await paymentCollection.find(query).toArray();
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    app.post('/payments', async (req, res) => {
      const payment = req.body;
      
      // Get the courseId from the payment or however you are getting it
      const courseName = payment.courseName; // Replace this with the correct way to get courseId
      
      try {
        // Find the course using courseId
        const filter = { name: courseName };
        const course = await courseCollection.findOne(filter);
    
        if (!course) {
          res.status(404).json({ message: 'Course not found' });
          return;
        }
    
        // Decrement available_seats by 1
        const newAvailableSeats = course.available_seats - 1;
    
        // Update the course with new available_seats count
        const updateResult = await courseCollection.updateOne(
          { _id: course._id },
          { $set: { available_seats: newAvailableSeats } }
        );
    
        if (updateResult.modifiedCount === 1) {
          // Insert the payment
          const insertResult = await paymentCollection.insertOne(payment);
          res.status(201).json({ message: 'Payment successful', insertResult });
        } else {
          res.status(500).json({ message: 'Failed to update course' });
        }
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'An error occurred' });
      }
    });
    


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('FluentLink is active')
  })
  
  app.listen(port, () => {
    console.log(`FluentLink is running on port ${port}`);
  })
  