require('dotenv').config();
const express = require('express')
const cors = require('cors')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express()

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const { default: home } = require('./home');
const port = process.env.PORT || 3000

//firebase admin 
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});


function generateTrackingId() {
    const prefix = "ETB";  // brand short code (E-Tuitionbd)
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timePart = Date.now().toString().slice(-6); 
    return `${prefix}-${randomPart}-${timePart}`;
}

// function generateId() {
//     const prefix = "ETB";  // brand short code (Bangla Express)
//     const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
//     const timePart = Date.now().toString().slice(-6); 
//     return `${prefix}-${randomPart}-${timePart}`;
// }


// medilayer //
app.use(express.json());
app.use(cors());

const varifyFBToken = async (req, res, next) =>{
  // console.log('header in the medilayer', req.headers.authorization);
  const token = req.headers.authorization;
  
  if(!token){
    return res.status(401).send({message: 'unauthorized access'})
  }
   try{
      const IdToken = token.split(" ")[1];
      const decoded = await admin.auth().verifyIdToken(IdToken);
      console.log("decoded the token", decoded);
      req.decoded_email = decoded.email;
      next();
   }
   catch(err){
      return res.status(401).send({message: 'unauthorized access'})
   }
}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rzhc4zj.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    const db = client.db('E_Tuition_DB');
    const usersCollection = db.collection('users');
    const tutorsCollection =db.collection('tutors')
    const tutionsCollection = db.collection('tutions');

    // ================users api ========
  app.post('/users', async (req, res) => {
    const user = req.body;
    user.role = user.role || "user"; 
    user.createAt = new Date();
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    if(user.role === "user"){
        user.userId = `STU-${randomNumber}`;
    } else {
        user.userId = `TUT-${randomNumber}`;
    }
    const email = user.email;
    const userExists = await usersCollection.findOne({email});
    if(userExists){
        return res.send({message: "user already exists"});
    }
    const result = await usersCollection.insertOne(user);
    res.send(result);
  });

    //  user by email
app.get('/users/:email', async (req, res) => {
  const email = req.params.email;

  try {
    const user = await usersCollection.findOne({ email: email });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }
    res.send(user);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// GET user role by email
app.get('/users/:email/role', async (req, res) => {
    try {
        const email = req.params.email;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const user = await usersCollection.findOne({ email: email });

        if (!user) {
            return res.status(404).json({ role: 'user' }); // default role
        }

        res.json({ role: user.role || 'user' });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ===============tutions post by user ==================
app.post('/tutions', async (req, res) => {
  try { const tutorData = req.body;
    tutorData.createdAt = new Date();
    const result = await tutionsCollection.insertOne(tutorData);
    res.send({
      success: true,
      message: "Tution request added successfully!",
      data: result
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
      error: error.message
    });
  }
}); 

//  all tutions get by home page
app.get('/tutions', async (req, res) => {
  try {
    const result = await tutionsCollection.find().toArray();

    res.send({
      success: true,
      message: "All tutors fetched successfully",
      data: result
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
      error: error.message
    });
  }
});

// tution get by id only 
app.get("/tutions/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const filter = { _id: new ObjectId(id) };

    const result = await tutionsCollection.findOne(filter);

    if (!result) {
      return res.status(404).send({ message: "Tution not found" });
    }

    res.send({
      status: true,
      data: result,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Server Error" });
  }
});

// teacher applay this job
app.patch("/tutions/apply/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const teacherInfo = req.body;   // from frontend

    const filter = { _id: new ObjectId(id) };
    const updateDoc = {
      $push: {
        teachers: teacherInfo,   // push teacher details into array
      },
    };

    const result = await tutionsCollection.updateOne(filter, updateDoc);

    res.send({
      status: true,
      message: "Teacher added successfully",
      data: result,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: "Server Error" });
  }
});

// teacher applaied delete student
app.delete("/tutions/:tutionId/teacher", async (req, res) => {
  
  try {
    const tutionId = req.params.tutionId; // tution id
    const teacherEmail = req.query.email; // teacher email

    if (!teacherEmail) return res.status(400).send({ error: "Email is required" });

    const result = await tutionsCollection.updateOne(
      { _id: new ObjectId(tutionId) },
      { $pull: { teachers: { email: teacherEmail } } } // pull teacher by email
    );

    if (result.modifiedCount > 0) {
      res.send({ success: true, message: "Teacher removed" });
    } else {
      res.status(404).send({ success: false, message: "Teacher not found" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, error: error.message });
  }
});

//  tutions delete by id admin 
app.delete('/tutions/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }

            const result = await tutionsCollection.deleteOne(query);
            res.send(result);
})



app.patch("/tutions/:id", async (req, res) => {
    const id = req.params.id;
    const { status, teacherEmail } = req.body;

    const tutionQuery = { _id: new ObjectId(id) };

    // 1️⃣ Always update tution status (old logic)
    const tutionResult = await tutionsCollection.updateOne(
        tutionQuery,
        { $set: { status } }
    );

    let userResult = null;

    // 2️⃣ Only when approved & teacherEmail exists
    if (status === "assigned" && teacherEmail) {
        const userQuery = { email: teacherEmail };

        userResult = await usersCollection.updateOne(
            userQuery,
            { $set: { available: "Active on Job" } }
        );
    }

    res.send({
        tutionModified: tutionResult.modifiedCount,
        userModified: userResult?.modifiedCount || 0
    });
});






  //============== Tutors post Api ======================
app.post('/tutors', async (req, res) => {
  try { const tutorData = req.body;
    tutorData.createdAt = new Date();
    const result = await tutorsCollection.insertOne(tutorData);
    res.send({
      success: true,
      message: "Tutor request added successfully!",
      data: result
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
      error: error.message
    });
  }
});

  // all tutor found
app.get('/tutors', async (req, res) => {
  try {
    const result = await tutorsCollection.find().toArray();

    res.send({
      success: true,
      message: "All tutors fetched successfully",
      data: result
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
      error: error.message
    });
  }
});

  // tutors by email
// GET /tutors/user?email=user@example.com
app.get('/tutors/email', async (req, res) => {
  try {
    const userEmail = req.query.email; // query param থেকে email নাও

    if (!userEmail) {
      return res.status(400).send({ success: false, message: "Email is required" });
    }

    const tutors = await tutorsCollection.find({ email: userEmail }).toArray();

    res.send({
      success: true,
      message: "Tutors fetched for user",
      data: tutors
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
      error: error.message
    });
  }
});

   //tutor found
app.get('/tutors/:id',  async (req, res) => {
  try {
    const id = req.params.id;
    const query = { _id: new ObjectId(id) };

    const result = await tutorsCollection.findOne(query);

    res.send({
      success: true,
      message: "Tutor fetched successfully",
      data: result
    });

  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Something went wrong",
      error: error.message
    });
  }
});

//  tutor delete by id 
app.delete('/tutors/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }

            const result = await tutorsCollection.deleteOne(query);
            res.send(result);
})

// admin stsatus update
app.patch("/tutors/:id", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body; // new status
  const result = await tutorsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status: status } }
  );
  res.send(result);
});

app.post('/payment-checkout-session', async (req, res) => {
  const info = req.body;

  const amount = parseInt(info.salary) * 100;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: `Tution Payment`,
          },
        },
        quantity: 1,
      },
    ],
    mode: 'payment',

    // 🔑 IMPORTANT
    metadata: {
      TutionId: info.TutionId,
      StudentEmail: info.StudentEmail,
      StudentName: info.StudentName,
      teacherEmail: info.teacherEmail,
    },

    customer_email: info.StudentEmail,

    success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
  });

  res.send({ url: session.url });
});


app.patch('/payment-success', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    const {
      TutionId,
      StudentEmail,
      teacherEmail,
    } = session.metadata;

    await db.collection('tutions').updateOne(
      { _id: new ObjectId(TutionId) },
      {
        $set: {
          payment: 'paid',
          transactionId: session.payment_intent,
          sessionId: session.id,
          teacherEmail,
        },
      }
    );

    res.json({
      success: true,
      transactionId: session.payment_intent,
      sessionId: session.id,
      TutionId,
      StudentEmail,
      teacherEmail,
      amount: session.amount_total / 100,
    });
  } catch (err) {
    console.error('Payment success error:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


 // =================Send a ping to confirm a successful connection ==================
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally { // Ensures that the client will close when you finish/error 
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  // res.send('Bangla Express server is raning.....!')
  res.send('Bangla Express server is raning.....!')
 
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})
