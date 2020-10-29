const functions = require('firebase-functions');
const app = require('express')();
const cors = require('cors');
const admin = require('firebase-admin');
const bodyParser = require('body-parser');
const phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
const serviceAccount = require("./serviceAccountKey.json");
const accountSid = functions.config().app.twilio_sid;
const authToken = functions.config().app.twilio_token;
const client = require('twilio')(accountSid, authToken);

admin.initializeApp(
    {
        credential: admin.credential.cert(serviceAccount),
        databaseURL: "https://login-app-17bed.firebaseio.com"
    }
);

const corsConfig = {
    origin: ['https://login-app-frontend.web.app', 'http://localhost:3000'],
    credentials: false
}

const db = admin.firestore();

app.use(cors(corsConfig));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// create access code for each phone number
app.post('/create-access-code', (req, res) => {
    let phoneNumber = req.body['phone'];
    phoneNumber = phoneUtil.parse(phoneNumber, 'US');
    if (!phoneUtil.isValidNumber(phoneNumber)) {
        return res.json({ message: "Invalid number, please try again.", invalidNumber: true });
    }
    phoneNumber = phoneNumber.getNationalNumber().toString();
    const accessCode = Math.floor(100000 + Math.random() * 900000);
    db.collection('loginData').get().then(data => {
        if (data.length === 0) {
            const newPhone = {
                phoneNumber: phoneNumber,
                accessCode: accessCode
            }
            db.collection('loginData').add(newPhone);
        } else {
            db.collection('loginData').where('phoneNumber', '==', phoneNumber).get().then((data) => {
                    const exist = data.docs[0];
                    if (!exist) {
                        const newPhone = {
                            phoneNumber: phoneNumber,
                            accessCode: accessCode
                        }
                        db.collection('loginData').add(newPhone)
                    } else {
                        exist.ref.update({ accessCode: accessCode });
                    }
                    client.messages.create({
                        body: "This is your access code: " + accessCode,
                        from: "+14792026551",
                        to: phoneNumber
                    })
                    .then(message => console.log(message))
                    .catch((err) => res.status(500).json({error: 'Numbers maybe invalid. Stacktrace:\n ' + err}));
                })
                .catch((err) => {
                    res.status(500).json({ error: 'Something went wrong' });
                    console.error(err);
                });
            }
            return res.json({ message: "Enter the 6-digits code texted to your phone.", accessCode });
        })
        .catch((err) => {
            res.status(500).json({ error: 'Something went wrong' });
            console.error(err);
        });
});

// validate the access code from frontend
app.post('/validate-code', (req, res) => {
    let { phone, code } = req.body;
    phone = phoneUtil.parse(phone, 'US').getNationalNumber().toString();
    db.collection('loginData').where('phoneNumber', '==', phone).get().then(data => {
        const phoneData = data.docs[0];
        if (code === phoneData.data().accessCode.toString()) {
            return res.json({ message: "You are verified", validated: true })
        } else {
            return res.json({ message: "Wrong access code, please try again.", validated: false})
        }
    })
    .catch((err) => {
        return res.status(500).json({ error: 'Something went wrong. Stacktrace:\n ' + err });
    });;
});

exports.api = functions.https.onRequest(app);
