import express from 'express';
import {getUserByEmail, getAllProducts, getDb} from './dbInterface.js';
import bcrypt from 'bcrypt';
import cors from 'cors';
import cookieParser from 'cookie-parser'
import {SignJWT, jwtVerify} from 'jose'
import dotenv from 'dotenv'
import crypto from 'crypto'
import {RefreshToken} from './dbInterface.js'

dotenv.config()
const app = express();
const db = getDb();
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET)

// TODO make tokens expire later

app.use(express.json());
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
})); // TODO only for development change backend to deliver frontend
app.use(cookieParser())

// add validation and sanatize for the email and password
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;

    const user = getUserByEmail(email);

    if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
    }

    const isValid = bcrypt.compareSync(password, user.password);


    if (!isValid) {
        return res.status(401).json({ error: "Invalid email or password" });
    }

    const accessToken = await buildAcessJWT(user, JWT_SECRET)
    const refreshToken = buildRefreshToken(user, req);


    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: false, // TODO set true when HTTPS is enabled
        sameSite: 'lax' // change when backend delivers the front? Maybe not if react is hosted elsewhere
    });
    console.log(`cookie header set: ${res.getHeader('Set-Cookie')}`)
    console.log(`Token: ${refreshToken}`)

    res.json({message: 'Login Successful'});
});

export function buildRefreshToken(user, req) {
    console.log(req.cookies)
    try {
        let random_token = crypto.randomBytes(64).toString('hex');
        const user_id = user.id;
        const created_time = Date.now()
        const expires_at = created_time + 30 * 60 * 1000
        const ip = req.ip //TODO may need to change this to req.headers['x-forwarded-for] || req.ip if we move behind a proxie
        const user_agent = req.headers['user-agent']
        const is_revoked = 'False';
        const old_token = req.cookies.refreshToken || null;


        console.log(random_token)
        console.log(user_id)
        console.log(created_time)
        console.log(expires_at)
        console.log(ip)
        console.log(user_agent)
        console.log(is_revoked)
        console.log(old_token)

        const new_token = new RefreshToken(
            random_token,
            user_id,
            created_time,
            expires_at,
            ip, 
            user_agent,
            is_revoked,
            old_token
        );
        new_token.insert()
        return random_token; 
    } catch (err) {
        if (err.code == "SQLITE_CONSTRAINT_PRIMARYKEY") {
            return buildRefreshToken(user, req)
        } else {
            throw console.log(err)
        }
    }
}

function invalidateOldToken(token) {
    
}

export async function buildAcessJWT(user, secret) {
    const signing_algorithm = "HS256";
    const token_type = "JWT";

    const header = {
        alg: signing_algorithm,
        typ: token_type
    }
    // registered claims
    const subject = user.id
    const issuer = "FitTrendz"
    const iat = Math.floor(Date.now() / 1000)
    const exp = iat + 60 * 15 // expires in 15 minutes

    // private claims 
    const name = user.name
    //const picture = user.picture TODO when pictures are implemented add back
    const role = user.role


    const payload = {
        name: name,
        //picture: picture,
        role: role
    }

    const jwt = await new SignJWT(payload)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .setIssuer(issuer)
    .setSubject(subject)
    .setProtectedHeader(header)
    .sign(secret)

    return jwt
}

//middleware
async function requireAuth(req, res, next) {
    console.log("middleware reached")
    console.log(`cookies:`, req.cookies);
    const token = req.cookies.token;

    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    console.log("token not undefined")
    console.log(token)
    try {
        const user = await jwtVerify(token, JWT_SECRET);
        console.log(user)
        req.user = user;
        next();
      } catch (e) {
        console.log(e)
        return res.status(401).json({ error: 'Invalid token' });
      }
}


// TODO update to add profile picture
app.post('/api/auth/update', requireAuth, async (req, res) => {
    const { email, password } = req.body
    console.log(req)
    console.log(req.body)
    console.log("Headers:", req.headers);
    console.log("Body:", req.body);
    const user = getUserByEmail(email);
    console.log(user)
    if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const updatePassword = db.prepare(`UPDATE users SET password = ?`)
    try {
        updatePassword.run(hashedPassword)
    } catch (error) {
        res.status(400).json({error: "Update password failed."})
    }
})

app.post('/api/auth/register', async (req, res) => {
    const { first_name, last_name, email, password } = req.body; // TODO add phone number and address to regular registration or only on purchase?
    const hashedPassword = bcrypt.hashSync(password, 10);
    try {
        const insert = db.prepare(`INSERT INTO users (
            first_name, 
            last_name, 
            email, 
            password, 
            role, 
            created_at, 
            updated_at,
            phone_number, 
            address
        ) VALUES
        (
            ?, ?, ?, ?, 
            ?, datetime(), datetime(), ?, ?
        )
        `
        );
        try {
            insert.run(
                first_name,
                last_name,
                email, 
                hashedPassword,
                "customer",
                null,
                null
            );
        } catch (error) {
            console.log(error)
            res.status(400).json({error: "Create new user failed."})
        }
        res.json({ success: "User registered" });
    } catch (error) {
        res.status(400).json({ error: "email already exists" });
    }
});

//TODO Has not been tested but would be used to retrieve signed in user data
app.get('/api/auth/me', requireAuth, async (req, res) => {
    console.log("Request recieved")
    try {
        const email = req.user.email; // from the requireAuth middlware
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
        res.json({ user });
        console.log("request authenticated")
    } catch (error) {
        console.log("no token found")
        res.status(400).json({ error: "Getting current user info failed." });
    }
});

//get all products
app.get('/api/product/getAll', async (req, res) => {
    console.log("Request for all products recieved")
    try {
        const allProducts = getAllProducts()
        console.log(allProducts)
        res.json({ success: "All products sucessfully retrieved", allProducts });
    } catch (error) {
        res.status(400).json({ error: "failed to get all products" });
        console.log(error)
    }
});



// Start Server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
