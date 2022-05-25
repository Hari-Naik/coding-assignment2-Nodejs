const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const path = require("path");

const dbPath = path.join(__dirname, "twitterClone.db");

const app = express();
app.use(express.json());

let db = null;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is running");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const authenticateToken = (req, res, next) => {
  let jwtToken;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  }
};

app.post("/register", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    if (password.length < 6) {
      res.status(400);
      res.send("Password is too short");
    } else {
      const userRegisterQuery = `INSERT INTO user (name,username,password,gender)
            VALUES('${name}', '${username}', '${hashedPassword}', '${gender}');`;
      await db.run(userRegisterQuery);
      res.status(200);
      res.send("User created successfully");
    }
  } else {
    res.status(400);
    res.send("User already exists");
  }
});

app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const getUser = `SELECT * FROM user WHERE username = '${username}';`;
  const dbUser = await db.get(getUser);

  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      res.send({ jwtToken });
      console.log(jwtToken);
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  } else {
    res.status(400);
    res.send("Invalid user");
  }
});

//API 3

app.get("/user/tweets/feed", authenticateToken, async (req, res) => {
  const getUsersQuery = `SELECT user.username as userName,(tweet.tweet),tweet.date_time as dateTime
   FROM user 
  INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN follower ON tweet.user_id=follower.follower_user_id
  ORDER BY tweet.date_time DESC
  LIMIT 4;`;
  const data = await db.all(getUsersQuery);
  res.send(data);
});

//API 4

app.get("/user/following/", authenticateToken, async (req, res) => {
  const getNamesOfUserFollowingQuery = `SELECT DISTINCT user.name FROM user INNER JOIN follower ON 
    user.user_id = follower.follower_user_id;`;
  const data = await db.all(getNamesOfUserFollowingQuery);
  res.send(data);
});

//API 5
app.get("/user/followers/", authenticateToken, async (req, res) => {
  const getNamesOfUserFollowingQuery = `SELECT DISTINCT user.name FROM user INNER JOIN follower ON 
    user.user_id = follower.following_user_id;`;
  const data = await db.all(getNamesOfUserFollowingQuery);
  res.send(data);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;
  const getTweetQuery = `SELECT tweet.tweet FROM (user INNER JOIN follower ON user.user_id = follower.follower_user_id) as T
    INNER JOIN tweet ON T.user_id = tweet.tweet_id
    WHERE tweet.tweet_id=${tweetId};`;
  const data = await db.all(getTweetQuery);

  if (data.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const getQuery = `SELECT tweet.tweet,COUNT(like.tweet_id) as likes,COUNT(reply.tweet_id)as replies,tweet.date_time as dateTime
      FROM (tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id) as T INNER JOIN reply ON T.tweet_id = reply.tweet_id
      WHERE T.tweet_id=${tweetId};`;
    const data = await db.get(getQuery);
    res.status(200);
    res.send(data);
  }
});

//API 7

app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;

  const getTweetQuery = `SELECT tweet.tweet FROM (user INNER JOIN follower ON user.user_id = follower.follower_user_id) as T
    INNER JOIN tweet ON T.user_id = tweet.tweet_id
    WHERE tweet.tweet_id=${tweetId};`;
  const data = await db.all(getTweetQuery);

  if (data.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const getUsernamesWhoLikedTheTweet = `SELECT DISTINCT user.name FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id) as T 
      INNER JOIN like ON T.user_id = like.user_id WHERE like.tweet_id = ${tweetId}`;
    const data = await db.all(getUsernamesWhoLikedTheTweet);
    const arr = data.map((each) => each.name);
    res.status(200);
    res.send({ likes: arr });
  }
});

//API 8

app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;

  const getTweetQuery = `SELECT tweet.tweet FROM (user INNER JOIN follower ON user.user_id = follower.follower_user_id) as T
    INNER JOIN tweet ON T.user_id = tweet.tweet_id
    WHERE tweet.tweet_id=${tweetId};`;
  const data = await db.all(getTweetQuery);

  if (data.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const getRepliesQuery = `SELECT user.name,reply.reply FROM (user INNER JOIN tweet ON user.user_id = tweet.user_id)
      INNER JOIN reply ON tweet.tweet_id = reply.tweet_id WHERE tweet.tweet_id = ${tweetId};`;

    const data = await db.all(getRepliesQuery);
    res.status(400);
    res.send({ replies: data });
  }
});

//API 9

app.get("/user/tweets/", authenticateToken, async (req, res) => {
  const getAllTweetsOfUser = `SELECT tweet.tweet,COUNT(like.tweet_id)as likes, COUNT(reply.tweet_id)as replies,tweet.date_time as dateTime FROM tweet INNER JOIN reply ON tweet.user_id=reply.user_id
  INNER JOIN like ON reply.user_id = like.user_id GROUP BY tweet.user_id;`;
  const data = await db.all(getAllTweetsOfUser);
  res.status(200);
  res.send(data);
});

//API 10
app.post("/user/tweets/", authenticateToken, async (req, res) => {
  const { tweet } = req.body;
  const createTweetQuery = `INSERT INTO tweet (tweet)
    VALUES('${tweet}');`;
  await db.run(createTweetQuery);
  res.send("Created a Tweet");
});

//API 11
app.delete("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;

  const getTweetQuery = `SELECT tweet.tweet FROM user INNER JOIN tweet ON user.user_id = tweet.user_id
    WHERE tweet.tweet_id = ${tweetId};`;
  const tweet = await db.get(getTweetQuery);
  if (tweet) {
    const deleteQuery = `DELETE FROM tweet WHERE tweet_id=${tweetId};`;
    await db.run(deleteQuery);
    res.status(200);
    res.send("Tweet Removed");
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

module.exports = app;
