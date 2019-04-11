// import needed libraries
const path = require("path");
const express = require("express");
const firebase = require("firebase");
const admin = require("firebase-admin");
const { Storage } = require("@google-cloud/storage");
const Multer = require("multer");
const router = express.Router();

// firebase configuration
const config = {
  apiKey: "AIzaSyAN8SbglExTCeQdmdjxs6kB4HzWXgS5Z2A",
  authDomain: "restaurants-20a4e.firebaseapp.com",
  databaseURL: "https://restaurants-20a4e.firebaseio.com",
  projectId: "restaurants-20a4e",
  storageBucket: "restaurants-20a4e.appspot.com",
  messagingSenderId: "254335241585"
};

// initialize firebase
firebase.initializeApp(config);

// firebase admin configuration
const adminConfig = require(path.join(__dirname, "ServiceAccountKey"));

// initialize firebase admin
admin.initializeApp({
  credential: admin.credential.cert(adminConfig),
  databaseURL: "https://restaurants-20a4e.firebaseio.com"
});

// firebase database
const db = admin.firestore();

// firebase storage
const storage = new Storage({
  projectId: "restaurants-20a4e",
  keyFilename: path.join(__dirname, "ServiceAccountKey.json")
});

// storage bucket
const bucket = storage.bucket("gs://restaurants-20a4e.appspot.com/");

// multer storage
const multer = Multer({
  storage: Multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// middleware function to check for logged-in users
const sessionChecker = (req, res, next) => {
  if (!firebase.auth().currentUser && !req.session.user) {
    res.redirect("/login");
  } else {
    next();
  }
};

// default
router.get("/", sessionChecker, (req, res) => {
  res.redirect("/home");
});

// login - GET
router.get("/login", (req, res) => {
  if (firebase.auth().currentUser) {
    res.redirect("/home");
  }
  res.render("login");
});

// login - POST
router.post("/login", (req, res) => {
  // get user input
  const { email, password } = req.body;
  console.log(req.body);

  // authenticate user
  firebase
    .auth()
    .signInWithEmailAndPassword(email, password)
    .then(data => {
      console.log(data.user);
      res.redirect("/home");
    })
    .catch(err => {
      console.log(err);
      req.flash("error", err.message);
      res.redirect("/login");
    });
});

// home
router.get("/home", sessionChecker, (req, res) => {
  // get count of users
  const usersCountPromise = getUsersCount();

  // get count of restaurants
  const restCountPromise = getRestaurantsCount();

  // get count of ads
  const adsCountPromise = getAdsCount();

  Promise.all([usersCountPromise, restCountPromise, adsCountPromise])
    .then(val => {
      res.render("home", {
        users: val[0],
        restaurants: val[1],
        ads: val[2]
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// users
router.get("/users", sessionChecker, (req, res) => {
  // empty array
  let users = [];

  // get data
  db.collection("users")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        users.push(doc.data());
      });

      // render users page
      res.render("users", {
        users
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// restaurants
router.get("/restaurants", sessionChecker, (req, res) => {
  // empty array
  let restaurants = [];

  // get data
  db.collection("restaurants")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        restaurants.push({
          id: doc.id,
          name: doc.data().name,
          description: doc.data().description,
          location: doc.data().location,
          latitude: doc.data().latitude,
          longitude: doc.data().longitude,
          rating: doc.data().rating,
          image: doc.data().image
        });
      });

      // render users page
      res.render("restaurants", {
        restaurants
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// add restaurant
router.get("/restaurants/add", sessionChecker, (req, res) => {
  res.render("addRestaurant");
});

// store restaurant
router.post(
  "/restaurants/store",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get inputs
    const {
      name,
      location,
      description,
      latitude,
      longitude,
      rating
    } = req.body;
    const file = req.file;

    if (file) {
      uploadImageToStorage(file)
        .then(val => {
          // add sweet data to firestore
          db.collection("restaurants")
            .doc()
            .set({
              name,
              location,
              description,
              latitude,
              longitude,
              geolocation: new admin.firestore.GeoPoint(
                Number.parseFloat(latitude),
                Number.parseFloat(longitude)
              ),
              rating,
              image_name: val[0],
              image: val[1]
            })
            .then(val => {
              console.log(val);
              res.redirect("/restaurants");
            })
            .catch(err => {
              console.log(err);
              res.redirect("/restaurants/add");
            });
        })
        .catch(err => {
          console.log(err);
          res.redirect("/restaurants/add");
        });
    } else {
      console.log("No file has been chosen");
      res.redirect("/restaurants/add");
    }
  }
);

// view restaurant details
router.get("/restaurants/:id", sessionChecker, (req, res) => {
  // get id
  const id = req.params.id;

  // check for center id
  if (id) {
    db.collection("restaurants")
      .doc(id)
      .get()
      .then(doc => {
        if (doc.exists) {
          // get restaurant data
          const restaurant = {
            id: doc.id,
            name: doc.data().name,
            description: doc.data().description,
            location: doc.data().location,
            image: doc.data().image,
            image_name: doc.data().image_name,
            latitude: doc.data().latitude,
            longitude: doc.data().longitude,
            geolocation: doc.data().geolocation,
            rating: doc.data().rating
          };

          // view restaurant details page
          res.render("viewRestaurant", {
            restaurant
          });
        } else {
          console.log("No data available for this restaurant");
          res.redirect("/restaurants");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/restaurants");
      });
  } else {
    console.log("No id for center");
    res.redirect("/restaurants");
  }
});

// delete abaya
router.get("/restaurants/:id/delete", sessionChecker, (req, res) => {
  // get id
  const id = req.params.id;

  if (id) {
    // get image file
    db.collection("restaurants")
      .doc(id)
      .get()
      .then(doc => {
        // load users' data
        if (doc.exists) {
          // delete image file from firebase storage
          bucket.file(doc.data().image_name).delete((err, api) => {
            if (err) {
              console.log(err);
              res.redirect("/restaurants");
            } else {
              // delete restaurant from database
              db.collection("restaurants")
                .doc(id)
                .delete()
                .then(() => {
                  console.log("Restaurant Deleted");
                  res.redirect("/restaurants");
                })
                .catch(err => {
                  console.log(err);
                  res.redirect("/restaurants");
                });
            }
          });
        } else {
          res.redirect("/restaurants");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/restaurants");
      });
  } else {
    console.log("Center ID cannot be empty");
    res.redirect("/restaurants");
  }
});

// edit center
router.get("/restaurants/:name/edit", sessionChecker, (req, res) => {
  // get sweet name
  const name = req.params.name;
  let data = [];

  if (name) {
    // get sweet details
    db.collection("restaurants")
      .where("name", "==", name)
      .get()
      .then(snapshot => {
        if (!snapshot.empty) {
          // fetch all results
          snapshot.forEach(doc => {
            data.push({
              id: doc.id,
              name: doc.data().name,
              location: doc.data().location,
              latitude: doc.data().latitude,
              longitude: doc.data().longitude,
              geolocation: doc.data().geolocation,
              description: doc.data().description,
              rating: doc.data().rating,
              image: doc.data().image,
              image_name: doc.data().image_name
            });
          });

          // render edit sweet page
          res.render("editRestaurant", {
            restaurant: data[0]
          });
        } else {
          console.log("No data available for this restaurant");
          res.redirect("/restaurants");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/restaurants");
      });
  } else {
    console.log("Cannot get restaurant name");
    res.redirect("/restaurants");
  }
});

// update center
router.post(
  "/restaurants/update",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get center details
    const {
      id,
      name,
      location,
      description,
      latitude,
      longitude,
      rating,
      image_name
    } = req.body;
    const file = req.file;

    if (file) {
      // delete old file
      bucket.file(image_name).delete((err, api) => {
        if (err) {
          console.log(err);
          res.redirect("/restaurants");
        } else {
          // try uploading the file
          uploadImageToStorage(file)
            .then(val => {
              // edit sweet data in firestore
              db.collection("restaurants")
                .doc(id)
                .update({
                  name,
                  location,
                  description,
                  latitude,
                  longitude,
                  geolocation: new admin.firestore.GeoPoint(
                    Number.parseFloat(latitude),
                    Number.parseFloat(longitude)
                  ),
                  rating,
                  image_name: val[0],
                  image: val[1]
                })
                .then(val => {
                  console.log(val);
                  res.redirect("/restaurants");
                })
                .catch(err => {
                  console.log(err);
                  res.redirect(`/restaurants/${name}/edit`);
                });
            })
            .catch(err => {
              console.log(err);
              res.redirect(`/restaurants/${name}/edit`);
            });
        }
      });
    } else {
      // edit sweet data in firestore
      db.collection("restaurants")
        .doc(id)
        .update({
          name,
          location,
          description,
          latitude,
          longitude,
          geolocation: new admin.firestore.GeoPoint(
            Number.parseFloat(latitude),
            Number.parseFloat(longitude)
          ),
          rating
        })
        .then(val => {
          console.log(val);
          res.redirect("/restaurants");
        })
        .catch(err => {
          console.log(err);
          res.redirect(`/restaurants/${name}/edit`);
        });
    }
  }
);

// ads
router.get("/ads", sessionChecker, (req, res) => {
  // empty array
  let ads = [];

  // get data
  db.collection("ads")
    .get()
    .then(snapshot => {
      // load users' data
      snapshot.forEach(doc => {
        ads.push({
          id: doc.id,
          name: doc.data().name,
          date: doc.data().date,
          image: doc.data().image
        });
      });

      // render users page
      res.render("ads", {
        ads
      });
    })
    .catch(err => {
      console.log(err);
      res.redirect("/500");
    });
});

// add ad
router.get("/ads/add", sessionChecker, (req, res) => {
  res.render("addAd");
});

// store ad
router.post("/ads/store", sessionChecker, multer.single("file"), (req, res) => {
  // get inputs
  const { name, date } = req.body;
  const file = req.file;

  if (file) {
    uploadImageToStorage(file)
      .then(val => {
        // add sweet data to firestore
        db.collection("ads")
          .doc()
          .set({
            name,
            date,
            image_name: val[0],
            image: val[1]
          })
          .then(val => {
            console.log(val);
            res.redirect("/ads");
          })
          .catch(err => {
            console.log(err);
            res.redirect("/ads/add");
          });
      })
      .catch(err => {
        console.log(err);
        res.redirect("/ads/add");
      });
  } else {
    console.log("No file has been chosen");
    res.redirect("/ads/add");
  }
});

// delete ad
router.get("/ads/:id/delete", sessionChecker, (req, res) => {
  // get id
  const id = req.params.id;

  if (id) {
    // get image file
    db.collection("ads")
      .doc(id)
      .get()
      .then(doc => {
        // load users' data
        if (doc.exists) {
          // delete image file from firebase storage
          bucket.file(doc.data().image_name).delete((err, api) => {
            if (err) {
              console.log(err);
              res.redirect("/ads");
            } else {
              // delete restaurant from database
              db.collection("ads")
                .doc(id)
                .delete()
                .then(() => {
                  console.log("Ad Deleted");
                  res.redirect("/ads");
                })
                .catch(err => {
                  console.log(err);
                  res.redirect("/ads");
                });
            }
          });
        } else {
          res.redirect("/ads");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/ads");
      });
  } else {
    console.log("Ad ID cannot be empty");
    res.redirect("/ads");
  }
});

// edit ad
router.get("/ads/:name/edit", sessionChecker, (req, res) => {
  // get sweet name
  const name = req.params.name;
  let data = [];

  if (name) {
    // get sweet details
    db.collection("ads")
      .where("name", "==", name)
      .get()
      .then(snapshot => {
        if (!snapshot.empty) {
          // fetch all results
          snapshot.forEach(doc => {
            data.push({
              id: doc.id,
              name: doc.data().name,
              date: doc.data().date,
              image: doc.data().image,
              image_name: doc.data().image_name
            });
          });

          // render edit sweet page
          res.render("editAd", {
            ad: data[0]
          });
        } else {
          console.log("No data available for this ad");
          res.redirect("/ads");
        }
      })
      .catch(err => {
        console.log(err);
        res.redirect("/ads");
      });
  } else {
    console.log("Cannot get ad name");
    res.redirect("/ads");
  }
});

// update ad
router.post(
  "/ads/update",
  sessionChecker,
  multer.single("file"),
  (req, res) => {
    // get center details
    const { id, name, date, image_name } = req.body;
    const file = req.file;

    if (file) {
      // delete old file
      bucket.file(image_name).delete((err, api) => {
        if (err) {
          console.log(err);
          res.redirect("/ads");
        } else {
          // try uploading the file
          uploadImageToStorage(file)
            .then(val => {
              // edit sweet data in firestore
              db.collection("ads")
                .doc(id)
                .update({
                  name,
                  date,
                  image_name: val[0],
                  image: val[1]
                })
                .then(val => {
                  console.log(val);
                  res.redirect("/ads");
                })
                .catch(err => {
                  console.log(err);
                  res.redirect(`/ads/${name}/edit`);
                });
            })
            .catch(err => {
              console.log(err);
              res.redirect(`/ads/${name}/edit`);
            });
        }
      });
    } else {
      // edit sweet data in firestore
      db.collection("ads")
        .doc(id)
        .update({
          name,
          date
        })
        .then(val => {
          console.log(val);
          res.redirect("/ads");
        })
        .catch(err => {
          console.log(err);
          res.redirect(`/ads/${name}/edit`);
        });
    }
  }
);

// logout
router.get("/logout", sessionChecker, (req, res) => {
  firebase.auth().signOut();
  res.redirect("/login");
});

// 500
router.get("/500", (req, res) => {
  res.render("500");
});

/**
 * Function to handle files
 */
const uploadImageToStorage = file => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject("No image file");
    }

    let newFileName = `${file.originalname}_${Date.now()}`;

    let fileUpload = bucket.file(newFileName);

    const blobStream = fileUpload.createWriteStream({
      metadata: {
        contentType: file.mimetype
      }
    });

    blobStream.on("error", err => {
      reject(err);
    });

    blobStream.on("finish", () => {
      // The public URL can be used to directly access the file via HTTP.
      const url = `https://firebasestorage.googleapis.com/v0/b/restaurants-20a4e.appspot.com/o/${
        fileUpload.name
      }?alt=media`;
      resolve([fileUpload.name, url]);
    });

    blobStream.end(file.buffer);
  });
};

/**
 * Function to get user count
 */
const getUsersCount = count => {
  return new Promise((reslove, reject) => {
    db.collection("users")
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          reslove(0);
        } else {
          reslove(snapshot.docs.length);
        }
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
};

/**
 * Function to get user count
 */
const getRestaurantsCount = count => {
  return new Promise((reslove, reject) => {
    db.collection("restaurants")
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          reslove(0);
        } else {
          reslove(snapshot.docs.length);
        }
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
};

/**
 * Function to get user count
 */
const getAdsCount = count => {
  return new Promise((reslove, reject) => {
    db.collection("ads")
      .get()
      .then(snapshot => {
        if (snapshot.empty) {
          reslove(0);
        } else {
          reslove(snapshot.docs.length);
        }
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
};

// export router
module.exports = router;
