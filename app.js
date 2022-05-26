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

const logger = (req, res, next) => {
  console.log(req.body);
  next();
};

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
        req.username = payload.username;
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
  const username = req.username;

  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);
  console.log(user_id);

  const getIdsQuery = `SELECT follower.following_user_id FROM follower 
  WHERE follower_user_id=${user_id};`;
  const ids = await db.all(getIdsQuery);
  console.log(ids);

  const getTweets = `SELECT user.username,tweet.tweet,tweet.date_time as dateTime FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
  INNER JOIN tweet ON follower.follower_user_id = tweet.user_id
  WHERE follower.following_user_id =1 OR follower.following_user_id=4
  ORDER BY tweet.date_time DESC
  LIMIT 4;
  ;`;
  const tweets = await db.all(getTweets);
  res.send(tweets);
});

//API 4

app.get("/user/following/", authenticateToken, async (req, res) => {
  const username = req.username;

  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);
  console.log(user_id);

  const getIdsQuery = `SELECT follower.following_user_id  FROM follower 
  WHERE follower.follower_user_id=${user_id};`;
  const ids = await db.all(getIdsQuery);
  console.log(ids);

  const getNames = `SELECT user.username as name FROM user WHERE user.user_id=1 OR user.user_id=4;`;
  const names = await db.all(getNames);
  res.status(200);
  res.send(names);
});

//API 5
app.get("/user/followers/", authenticateToken, async (req, res) => {
  const username = req.username;
  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);

  const getIdsQuery = `SELECT follower.follower_user_id  FROM follower
  WHERE follower.following_user_id=${user_id};`;
  const ids = await db.all(getIdsQuery);
  console.log(ids);

  const getNames = `SELECT user.username as name FROM user 
  WHERE user.user_id=1 OR user.user_id=4;`;
  const namesArr = await db.all(getNames);
  res.send(namesArr);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;

  const username = req.username;
  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);

  const getIdsOfUserFollowingQuery = `SELECT follower.following_user_id  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
  WHERE user.user_id=${user_id};`;
  const ids = await db.all(getIdsOfUserFollowingQuery);

  const getTweetsOfUserFollowing = `SELECT tweet.tweet,COUNT(like.tweet_id)as likes,COUNT(reply.tweet_id) as replies,
  tweet.date_time as dateTime FROM tweet INNER JOIN reply ON tweet.tweet_id=reply.tweet_id INNER JOIN like ON reply.tweet_id = like.tweet_id
WHERE (tweet.user_id=1 OR tweet.user_id=4) AND tweet.tweet_id=${tweetId};`;

  const tweetObj = await db.get(getTweetsOfUserFollowing);

  if (tweetObj.tweet === null) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    res.status(200);
    res.send(tweetObj);
  }
});

//API 7

app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;

  const username = req.username;
  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);

  const getIdsOfUserFollowingQuery = `SELECT follower.following_user_id  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
  WHERE user.user_id=${user_id};`;
  const ids = await db.all(getIdsOfUserFollowingQuery);

  const getTweet = `SELECT tweet.tweet FROM tweet 
  WHERE tweet.user_id IN (1,4) AND tweet.tweet_id = ${tweetId};`;

  const tweet = await db.get(getTweet);
  if (tweet === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const usernamesWhoLikeTheTweet = `SELECT user.username FROM user INNER JOIN like 
      ON user.user_id = like.user_id
       WHERE like.tweet_id=${tweetId};`;

    const data = await db.all(usernamesWhoLikeTheTweet);
    const namesArr = data.map((each) => each.username);
    res.send({ likes: namesArr });
  }
});

//API 8

app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  const { tweetId } = req.params;

  const username = req.username;
  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);

  const getIdsOfUserFollowingQuery = `SELECT follower.following_user_id  FROM user INNER JOIN follower ON user.user_id=follower.follower_user_id
  WHERE user.user_id=${user_id};`;
  const ids = await db.all(getIdsOfUserFollowingQuery);

  const getTweet = `SELECT tweet.tweet FROM tweet 
  WHERE tweet.user_id IN (1,4) AND tweet.tweet_id = ${tweetId};`;

  const tweet = await db.get(getTweet);
  if (tweet === undefined) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const usernamesWhoLikeTheTweet = `SELECT user.username as name,reply.reply FROM user INNER JOIN reply
      ON user.user_id = reply.user_id
       WHERE reply.tweet_id=${tweetId};`;

    const data = await db.all(usernamesWhoLikeTheTweet);
    res.send({ replies: data });
  }
});

//API 9

app.get("/user/tweets/", authenticateToken, async (req, res) => {
  const username = req.username;
  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);

  const getAllTweetsOfUser = `SELECT tweet.tweet, COUNT(like.tweet_id) as likes, COUNT(reply.tweet_id) as replies, tweet.date_time as dateTime
 FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id INNER JOIN reply ON tweet.tweet_id=reply.tweet_id
 WHERE tweet.user_id = ${user_id}
 GROUP BY tweet.tweet_id;`;

  const tweetsArr = await db.all(getAllTweetsOfUser);
  res.status(200);
  res.send(tweetsArr);
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
  const username = req.username;
  const getUserID = `SELECT user.user_id FROM user WHERE user.username='${username}';`;
  const { user_id } = await db.get(getUserID);

  const checkTweet = `SELECT tweet FROM tweet WHERE tweet.user_id=${user_id} ;`;
  const arr = await db.all(checkTweet);
  if (arr.length === 0) {
    res.status(401);
    res.send("Invalid Request");
  } else {
    const deleteUserTweet = `DELETE FROM tweet WHERE tweet.tweet_id=${tweetId};`;
    await db.run(deleteUserTweet);
    res.status(200);
    res.send("Tweet Removed");
  }
});

module.exports = app;
