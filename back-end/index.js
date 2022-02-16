const express = require("express");
const app = express();
const cors = require("cors");
//const admin = require("firebase-admin");
require("dotenv").config();
const { MongoClient } = require("mongodb");
const ObjectId = require("mongodb").ObjectId;
const stripe = require("stripe")(process.env.STRIPE_SECRET);
const fileUpload = require("express-fileupload");
const moment = require("moment");

const port = process.env.PORT || 5000;

// const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

console.log(process.env.DB_USER);

app.use(cors());
app.use(express.json());
app.use(fileUpload());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jjcvz.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function verifyToken(req, res, next) {
  //   if (req.headers?.authorization?.startsWith("Bearer ")) {
  //     const token = req.headers.authorization.split(" ")[1];

  //     try {
  //       const decodedUser = await admin.auth().verifyIdToken(token);
  //       req.decodedEmail = decodedUser.email;
  //     } catch {}
  //   }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("doctors_portal");
    const appointmentsCollection = database.collection("appointments");
    const usersCollection = database.collection("users");
    const doctorsCollection = database.collection("doctors");

    app.get("/appointments", verifyToken, async (req, res) => {
      const email = req.query.email;
      const date = req.query.date;

      const query = { email: email, date: date };

      const cursor = appointmentsCollection.find(query);
      const appointments = await cursor.toArray();
      res.json(appointments);
    });
    app.get("/allAppointments", async (req, res) => {
      const cursor = appointmentsCollection.find({});
      const appointments = await cursor.toArray();
      res.json(appointments);
    });
    // delete appointment 
    app.delete("/appointments/cancel/:id", async (req, res) => {
      const query = { _id: ObjectId(req.params.id) };
      const result = await appointmentsCollection.deleteOne(query);
      res.json(result);
    });

    // update appointment status
    app.patch("/appointments/status/:id", async (req, res) => {
      console.log(req.params.id);
      const filter = { _id: ObjectId(req.params.id) };
      const options = { upsert: true };
      // create a document that sets the plot of the movie
      const updateDoc = {
        $set: req.body,
      };
      const result = await appointmentsCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    app.get("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await appointmentsCollection.findOne(query);
      res.json(result);
    });

    app.post("/appointments", async (req, res) => {
      const appointment = req.body;
      appointment.time = new Date(appointment.time).toLocaleString();
      const now = new Date(appointment.time);
      const minus10 = moment(now).subtract(10, "minutes").toLocaleString();
      const plus10 = moment(now).add(10, "minutes").toLocaleString();
      const result = await appointmentsCollection
        .find({
          time: {
            $gte: new Date(minus10).toLocaleString(),
            $lt: new Date(plus10).toLocaleString(),
          },
        })
        .toArray();
      if (result.length) {
        res.send({
          message: "This time is not available! Please try another time.",
        });
      } else {
        const result = await appointmentsCollection.insertOne(appointment);
        res.send(result);
      }
    });

    app.get("/checkAvailableTime/:time", async (req, res) => {
      const selectedTime = new Date(req.params.time).toLocaleString();

      const now = new Date(selectedTime);

      const minus10 = moment(now).subtract(10, "minutes").toLocaleString();

      const plus10 = moment(now).add(10, "minutes").toLocaleString();
      const gthen = new Date(minus10).toLocaleString();
      const lthen = new Date(plus10).toLocaleString();

      const result = await appointmentsCollection
        .find({
          time: {
            $gte: gthen,
            $lt: lthen,
          },
        })
        .toArray();
      if (result.length) {
        res.send({
          message: "This time is not available! Please try another time.",
        });
      } else {
        res.send({
          message: "This time is available",
        });
      }
    });

    app.put("/appointments/:id", async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          payment: payment,
        },
      };
      const result = await appointmentsCollection.updateOne(filter, updateDoc);
      res.json(result);
    });

    // doctors api
    app.get("/doctors", async (req, res) => {
      const cursor = doctorsCollection.find({});
      const doctors = await cursor.toArray();
      res.json(doctors);
    });

    app.get("/doctors/:id", async (req, res) => {
      const query = { _id: ObjectId(req.params.id) };
      const doctor = await doctorsCollection.findOne(query);
      res.json(doctor);
    });

    app.post("/doctors", async (req, res) => {
      const name = req.body.name;
      console.log(req.body)
      const email = req.body.email;
      const hospital = req.body.hospital;
         const degree = req.body.degree;
        const specialist = req.body.specialist;

      const pic = req.files.image;
      const picData = pic.data;
      const encodedPic = picData.toString("base64");
      const imageBuffer = Buffer.from(encodedPic, "base64");
      const doctor = {
        name,
        email,
        hospital,
        image: imageBuffer,
        degree,
        specialist,
      };
      const result = await doctorsCollection.insertOne(doctor);
      res.json(result);
    });

    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      // console.log(req.params.email);
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      console.log(user);
      let isAdmin = false;
      if (user?.role === "admin") {
        isAdmin = true;
      }
      res.json({ admin: isAdmin });
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.json(result);
    });

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = { email: user.email };
      const options = { upsert: true };
      const updateDoc = { $set: user };
      const result = await usersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.json(result);
    });

    app.put("/users/admin", verifyToken, async (req, res) => {
      const user = req.body;
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = await usersCollection.findOne({
          email: requester,
        });
        if (requesterAccount.role === "admin") {
          const filter = { email: user.email };
          const updateDoc = { $set: { role: "admin" } };
          const result = await usersCollection.updateOne(filter, updateDoc);
          res.json(result);
        }
      } else {
        res
          .status(403)
          .json({ message: "you do not have access to make admin" });
      }
    });

    app.post("/create-payment-intent", async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        currency: "usd",
        amount: amount,
        payment_method_types: ["card"],
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    });
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello Doctors portal!");
});

app.listen(port, () => {
  console.log(`listening at ${port}`);
});
