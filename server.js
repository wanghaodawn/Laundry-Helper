const express = require('express');
const hbs = require('hbs');
const fs = require('fs');
const url = require('url');
const mysql = require('mysql');
const moment = require('moment-timezone');
const session = require('client-sessions');
const bodyParser = require('body-parser');
const https = require('https');
const nodemailer = require('nodemailer');

const usersModel = require('./usersModel.js');
const machinesModel = require('./machinesModel.js');
const schedulesAnnonymousModel = require('./schedulesAnnonymousModel.js');
const schedulesModel = require('./schedulesModel.js');
const landlordsModel = require('./landlordsModel.js');
const helper = require('./helper.js');
const dashboard = require('./dashboard.js');
const feedbacksModel = require('./feedbacksModel.js');

var app = express();
const port = 3000;
const dns = 'http://128.237.128.209:3000/'

process.env.TZ = 'EST';

// Configuration of email
const emailAddress = 'no.reply.ezlaundry@gmail.com';
var emailPassword = '';
var transporter = '';
var mailOptions = {}
helper.getEmailPassword(function (result) {
    emailPassword = result.trim();
    if (emailPassword == '') {
        console.log(helper.NO_EMAIL_PASSWORD_FOUND);
    } else {
        console.log("Found Email Password");
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: emailAddress,
                pass: emailPassword
            }
        });
        console.log(emailAddress);
        // console.log(emailPassword);
    }
});

// Configurate the connection to MySQL
var connection = mysql.createConnection({
    host     : 'localhost',
    user     : 'root',
    password : '',
    database : 'laundry_helper'
});
connection.connect();

// Get API Key for Google Map
var GoogleMapAPIKey = '';
helper.getGooglMapAPIKey(function (result) {
    GoogleMapAPIKey = result;
    if (GoogleMapAPIKey == '') {
        console.log(helper.NO_GOOGLE_MAP_API_KEY_FOUND);
    } else {
        console.log("Found Google MAP API KEY");
    }
});

// Configuration
hbs.registerPartials(__dirname + '/views/partials')
app.set('view engine', 'hbs');
app.use(express.static(__dirname + '/public'));

// Middleware - Generate logs of the server
app.use((req, res, next) => {
  var now = new Date().toString();
  var log = `${now}: ${req.method} ${req.url}`;

  console.log(log);
  fs.appendFile('server.log', log + '\n', (err) => {
    if (err) {
        console.log(err);
        console.log('Unable to append to file system');
    }
  });
  next();
});

// Configuration of session
app.use(session({
  cookieName: 'session',
  secret: 'random_string_goes_here',
  duration: 30 * 60 * 1000,
  activeDuration: 5 * 60 * 1000,
}));

// Set body parser
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());

// Web Server
// Dashboard
app.get('/', (req, res) => {
    const user = req.session.user;
    // console.log(JSON.stringify(req.session.user));
    if (!user) {
        res.redirect('/login');
    } else {
        dashboard.showDashboard(connection, user, function(result) {
            // console.log(result.schedules);
            res.render('dashboard.hbs', {
                user: JSON.stringify(user, undefined, 2),
                schedules: JSON.stringify(result.schedules)
            });
        })
    }
});

// test
app.get('/testapi/test.json', (req, res) => {
    var test = {
        name: 'Hao Wang'
    }
    res.send(test);
});

// Login page
app.get('/login', (req, res) => {
    const user = req.session.user;
    // console.log(JSON.stringify(req.session.user));
    if (!user) {
        res.render('login.hbs', {});
    } else {
        res.redirect('/');
    }
});

// Login action
app.post('/login', (req, res) => {
    const username = req.body.username;
    const password = req.body.password;
    usersModel.login(connection, username, password, function(result) {
        // console.log(result);
        if (!result.user) {
            res.render('login.hbs', {
                message: result.message
            });
        } else {
            req.session.user = result.user;
            res.redirect('/');
        }
    });
});

// Register page
app.get('/register', (req, res) => {
    const user = req.session.user;
    // console.log(JSON.stringify(req.session.user));
    if (!user) {
        res.render('register.hbs', {});
    } else {
        redirect('/');
    }
});

// Register action
app.post('/register', (req, res) => {
    const inputUser = {
        username:   req.body.username,
        password:   req.body.password,
        firstname:  req.body.firstname,
        lastname:   req.body.lastname,
        address:    req.body.address,
        zip:        req.body.zip,
        city:       req.body.city,
        state:      req.body.state,
        country:    req.body.country,
    };
    usersModel.register(connection, inputUser, function(result) {
        // console.log(result);
        if (!result.user) {
            res.render('register.hbs', {
                message: result.message
            });
        } else {
            req.session.user = result.user;
            res.redirect('/');
        }
    });
});

// Change address
app.get('/change_info', (req, res) => {
    const user = req.session.user;
    // console.log(JSON.stringify(req.session.user));
    if (!user) {
        res.render('login.hbs', {});
    } else {
        res.render('changeInfo.hbs', {
            user: req.session.user
        });
    }
});

app.post('/change_info', (req, res) => {
    const inputUser = {
        username:           req.session.user.username,
        password:           req.body.password,
        newPassword:        req.body.newPassword,
        confirmPassword:    req.body.confirmPassword,
        firstname:          req.body.firstname,
        lastname:           req.body.lastname,
        address:            req.body.address,
        zip:                req.body.zip,
        city:               req.body.city,
        state:              req.body.state,
        country:            req.body.country,
    };
    usersModel.changeInfo(connection, inputUser, req.session.user, function(result) {
        // console.log(result);
        if (result.message != helper.SUCCESS) {
            res.render('changeInfo.hbs', {
                message: result.message,
                user: req.session.user,
            });
        } else {
            req.session.user = result.user;
            res.redirect('/');
        }
    });
});

// logout action
app.get('/logout', (req, res) => {
    req.session.user = null;
    res.redirect('/');
});


// RESTful APIs
// Create a user
app.post('/api/add_user/', (req, res) => {
    usersModel.createUser(GoogleMapAPIKey, connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        // Send email to the user's email
        if (result.message == helper.SUCCESS) {
            // console.log(transporter);
            var mailOptions = {
                from:    emailAddress,
                to:      result.user.email.replace(/\'/g, ''),
                subject: '[ezLaundry] Please Verify Your Email Address Within 24 Hours',
                html: `<a href=${dns}api/verify_email_address?code=${result.code}><h3>Please Press Here to Verify Your Email Address</h3></a>` // html body
            };

            // send mail with defined transport object
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                    return res.send({message: helper.FAILED_SENDING_EMAIL});
                }
                console.log('Message %s sent: %s', info.messageId, info.response);
                return res.send(output);
            });
        } else {
            return res.send(output);
        }
    });
});

// Login a user
app.post('/api/login_user/', (req, res) => {
    usersModel.loginUser(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        // console.log(output);
        res.send(output);
    });
});

// Check the old password before update user info
app.post('/api/check_old_password/', (req, res) => {
    usersModel.checkOldPassword(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        // console.log(output);
        res.send(output);
    });
});

// Update User Info
app.post('/api/update_user_info/', (req, res) => {
    usersModel.updateUserInfo(GoogleMapAPIKey, connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        // console.log(output);
        res.send(output);
    });
});

// Delte one user
app.post('/api/delete_one_user/', (req, res) => {
    usersModel.deleteOneUser(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete all users
app.post('/api/delete_all_users/', (req, res) => {
    usersModel.deleteAllUsers(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Show all users
app.post('/api/show_all_users/', (req, res) => {
    usersModel.showAllUsers(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        // console.log(output);
        res.send(output);
    });
});

// Create a machine
app.post('/api/add_machine/', (req, res) => {
    machinesModel.createMachine(GoogleMapAPIKey, connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete one machine
app.post('/api/delete_one_machine/', (req, res) => {
    machinesModel.deleteOneMachine(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete all machines
app.post('/api/delete_all_machines/', (req, res) => {
    machinesModel.deleteAllMachines(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Show all machines
app.post('/api/show_all_machines/', (req, res) => {
    machinesModel.showAllMachines(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Create a schedule_annonymous
app.post('/api/add_schedule/', (req, res) => {
    schedulesModel.createSchedule(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete first n schedules annonymous
app.post('/api/delete_first_n_schedule/', (req, res) => {
    schedulesModel.deleteFirstNScheduleMachine(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete last n schedules annonymous
app.post('/api/delete_last_n_schedule/', (req, res) => {
    schedulesModel.deleteLastNScheduleMachine(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete all schedules annonymous of a machine
app.post('/api/delete_machine_schedule/', (req, res) => {
    schedulesModel.deleteSchedulesMachine(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete all schedules annonymous
app.post('/api/delete_all_schedule/', (req, res) => {
    schedulesModel.deleteAllSchedules(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Show all schedules annonymous of a machine
app.post('/api/show_all_schedule/', (req, res) => {
    schedulesModel.showAllSchedules(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Create a schedule_annonymous
app.post('/api/add_schedule_anonymous/', (req, res) => {
    schedulesAnnonymousModel.createSchedule(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete first n schedules annonymous
app.post('/api/delete_first_n_schedule_anonymous/', (req, res) => {
    schedulesAnnonymousModel.deleteFirstNScheduleMachine(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete last n schedules annonymous
app.post('/api/delete_last_n_schedule_anonymous/', (req, res) => {
    schedulesAnnonymousModel.deleteLastNScheduleMachine(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete all schedules annonymous of a machine
app.post('/api/delete_machine_schedule_anonymous/', (req, res) => {
    schedulesAnnonymousModel.deleteSchedulesMachine(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete all schedules annonymous
app.post('/api/delete_all_schedule_anonymous/', (req, res) => {
    schedulesAnnonymousModel.deleteAllSchedules(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Show all schedules annonymous of a machine
app.post('/api/show_all_schedule_anonymous/', (req, res) => {
    schedulesAnnonymousModel.showAllSchedules(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Show all schedules annonymous of the user's location and type
app.post('/api/show_user_schedule_anonymous_type/', (req, res) => {
    schedulesAnnonymousModel.showAllSchedulesAnnUserType(connection, req.body, res, function(result) {
        // console.log(result);
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Show all schedules of the user's location and type
app.post('/api/show_user_schedule_type/', (req, res) => {
    schedulesmousModel.showAllSchedulesUserType(connection, req.body, res, function(result) {
        // console.log(result);
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Show all schedules of the user's location and type
app.post('/api/show_all_user_schedules_type/', (req, res) => {
    schedulesAnnonymousModel.showAllSchedulesAnnUserType(connection, req.body, res, function(result1) {
        // console.log(result1);
        var output1 = helper.stripJSON(result1);
        schedulesModel.showAllSchedulesUserType(connection, req.body, res, function(result2) {
            var output = {};
            var output2 = helper.stripJSON(result2);
            var schedules_all = [];

            // Get return status
            if (output1.message == helper.SUCCESS && output2.message == helper.SUCCESS) {
                output.message = helper.SUCCESS;
            } else if (output1.message == helper.SUCCESS) {
                output.message = output2.message;
            } else if (output2.message == helper.SUCCESS) {
                output.message = output1.message;
            } else {
                output.message = output1.message;
            }

            // Get all schedules
            for (var i in output1.schedules) {
                schedules_all.push(output1.schedules[i]);
            }
            for (var i in output2.schedules) {
                schedules_all.push(output2.schedules[i]);
            }

            output.schedules = schedules_all;
            res.send(JSON.stringify(output));
            // console.log('\n');
            // console.log(JSON.stringify(output));
            return;
        });
    });
});


// Show all schedules that the user made and type
app.post('/api/show_user_schedules_type_after_now/', (req, res) => {
    schedulesModel.showSchedulesUserTypeAfterNow(connection, req.body, res, function(result2) {
        var output = {};
        var output2 = helper.stripJSON(result2);
        var schedules = [];

        // Get return status
        output.message = result2.message

        // console.log(JSON.stringify(output1));
        // console.log(JSON.stringify(output2));

        // Get all schedules and filter all former schedules today
        const now = moment(new Date()).tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');

        var dic = {};
        for (var i in output2.schedules) {
            // console.log(now);
            // console.log(output2.schedules[i].end_time);
            // console.log(moment(now).isAfter(moment(output2.schedules[i].end_time)))
            if (moment(now).isAfter(moment(output2.schedules[i].end_time)) && output2.schedules[i].end_time != null) {
                output2.schedules[i].end_time = null;
                output2.schedules[i].start_time = null;
                output2.schedules[i].schedule_id = null;
                output2.schedules[i].username = null;
                output2.schedules[i].access_code = null;
            }
            if (output2.schedules[i].machine_id in dic) {
                dic[output2.schedules[i].machine_id].push(output2.schedules[i]);
            } else {
                var list = [];
                list.push(output2.schedules[i]);
                dic[output2.schedules[i].machine_id] = list;
            }
        }

        // console.log(JSON.stringify(dic));
        var display_id = 1;
        for (key in dic) {
            var list = dic[key];
            list.sort(function (a, b) {
                // Handle one or two are null
                if (a.end_time == null && b.end_time != null) {
                    return 1;
                } else if (a.end_time != null && b.end_time == null) {
                    return -1;
                } else if (a.end_time != null && b.end_time != null) {
                    return 0;
                }

                // compare end_time
                if (a.end_time < a.end_time) {
                    return -1;
                } else if (a.end_time == a.end_time) {
                    return 0;
                } else {
                    return 1;
                }
            });
            list[0].display_id = display_id;
            display_id += 1;
            schedules.push(list[0]);
        }


        output.schedules = schedules;
        if (schedules.length == 0) {
            output.message = helper.NO_MACHINE_THIS_ADDRESS;
        }

        res.send(JSON.stringify(output));
        // console.log('\n');
        // console.log(JSON.stringify(output));
        return;
    });
});


// Show all schedules of the user's location and type
app.post('/api/show_all_user_schedules_type_after_now/', (req, res) => {
    schedulesAnnonymousModel.showAllSchedulesAnnUserTypeAfterNow(connection, req.body, res, function(result1) {
        // console.log(result1);
        var output1 = helper.stripJSON(result1);
        schedulesModel.showAllSchedulesUserTypeAfterNow(connection, req.body, res, function(result2) {
            var output = {};
            var output2 = helper.stripJSON(result2);
            var schedules = [];

            // Get return status
            if (output1.message == helper.SUCCESS && output2.message == helper.SUCCESS) {
                output.message = helper.SUCCESS;
            } else if (output1.message == helper.SUCCESS) {
                output.message = output2.message;
            } else if (output2.message == helper.SUCCESS) {
                output.message = output1.message;
            } else {
                output.message = output1.message;
            }

            // console.log(JSON.stringify(output1));
            // console.log(JSON.stringify(output2));

            // Get all schedules and filter all former schedules today
            const now = moment(new Date()).tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');

            var dic = {};
            for (var i in output1.schedules) {
                // console.log(now);
                // console.log(output1.schedules[i].end_time);
                // console.log(moment(now).isAfter(moment(output1.schedules[i].end_time)))
                if (moment(now).isAfter(moment(output1.schedules[i].end_time)) && output1.schedules[i].end_time != null) {
                    output1.schedules[i].end_time = null;
                    output1.schedules[i].start_time = null;
                    output1.schedules[i].schedule_id = null;
                }
                if (output1.schedules[i].machine_id in dic) {
                    dic[output1.schedules[i].machine_id].push(output1.schedules[i]);
                } else {
                    var list = [];
                    list.push(output1.schedules[i])
                    dic[output1.schedules[i].machine_id] = list;
                }
            }
            for (var i in output2.schedules) {
                // console.log(now);
                // console.log(output2.schedules[i].end_time);
                // console.log(moment(now).isAfter(moment(output2.schedules[i].end_time)))
                if (moment(now).isAfter(moment(output2.schedules[i].end_time)) && output2.schedules[i].end_time != null) {
                    output2.schedules[i].end_time = null;
                    output2.schedules[i].start_time = null;
                    output2.schedules[i].schedule_id = null;
                    output2.schedules[i].username = null;
                }
                if (output2.schedules[i].machine_id in dic) {
                    dic[output2.schedules[i].machine_id].push(output2.schedules[i]);
                } else {
                    var list = [];
                    list.push(output2.schedules[i]);
                    dic[output2.schedules[i].machine_id] = list;
                }
            }

            // console.log(JSON.stringify(dic));
            var display_id = 1;
            for (key in dic) {
                var list = dic[key];
                list.sort(function (a, b) {
                    // Handle one or two are null
                    if (a.end_time == null && b.end_time != null) {
                        return 1;
                    } else if (a.end_time != null && b.end_time == null) {
                        return -1;
                    } else if (a.end_time != null && b.end_time != null) {
                        return 0;
                    }

                    // compare end_time
                    if (a.end_time < a.end_time) {
                        return -1;
                    } else if (a.end_time == a.end_time) {
                        return 0;
                    } else {
                        return 1;
                    }
                });
                list[0].display_id = display_id;
                display_id += 1;
                schedules.push(list[0]);
            }


            output.schedules = schedules;
            if (schedules.length == 0) {
                output.message = helper.NO_MACHINE_THIS_ADDRESS;
            }

            res.send(JSON.stringify(output));
            // console.log('\n');
            // console.log(JSON.stringify(output));
            return;
        });
    });
});

// Quick reservation
app.post('/api/quick_reservation/', (req, res) => {
    console.log(req.body);
    schedulesModel.quickResercation(connection, req.body, res, function(result) {
        // console.log(result);
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Create Landlord
app.post('/api/add_landlord/', (req, res) => {
    landlordsModel.createLandlord(GoogleMapAPIKey, connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Delete One Landlord
app.post('/api/delete_one_landlord/', (req, res) => {
    landlordsModel.deleteOneLandlord(GoogleMapAPIKey, connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        res.send(output);
    });
});

// Send email to landlord, get username from the app
app.post('/api/send_email_to_landlord/', (req, res) => {
    landlordsModel.sendEmailToLandlord(connection, req.body, res, function(result) {
        var result = helper.stripJSON(result);

        if (result.message !== helper.SUCCESS) {
            return res.send({message: result.message});
        }

        // console.log(transporter);
        var mailOptions = {
            from:    emailAddress,
            to:      result.email,
            subject: `[ezLaundry][Maintainese Requested] @ ${result.property_name} by ${req.body.username}`,
            html: `<b>${req.body.report}</b>` // html body
        };

        // send mail with defined transport object
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                return res.send({message: helper.FAILED_SENDING_EMAIL});
            }
            console.log('Message %s sent: %s', info.messageId, info.response);
        });

        return res.send({message: result.message});
    });
});

// Send us feedback
app.post('/api/send_feedback/', (req, res) => {
    feedbacksModel.addFeedback(connection, req.body, res, function(result) {
        var result = helper.stripJSON(result);
        // console.log(result);

        if (result.message != helper.SUCCESS) {
            return res.send({message: result.message});
        }

        // console.log(transporter);
        var mailOptions = {
            from:    emailAddress,
            to:      result.email.replace(/\'/g, ''),
            subject: '[ezLaundry] Your Feedback Has Been Received',
            html: `<b>Your Feedback Has Been Received</b>` // html body
        };

        // send mail with defined transport object
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log(error);
                return res.send({message: helper.FAILED_SENDING_EMAIL});
            }
            console.log('Message %s sent: %s', info.messageId, info.response);
        });
        return res.send({message: result.message});
    });
});

// Let the user verify the email address
app.get('/api/verify_email_address?', (req, res) => {
    usersModel.verifyEmailAddress(connection, req.query, res, function(result) {
        return res.send(result.message);
    });
});

// Resend verification email
app.post('/api/reverify_email_address/', (req, res) => {
    usersModel.reverifyEmailAddress(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        // Send email to the user's email
        if (result.message == helper.SUCCESS) {
            // console.log(transporter);
            var mailOptions = {
                from:    emailAddress,
                to:      result.email.replace(/\'/g, ''),
                subject: '[ezLaundry] Please Verify Your Email Address Within 24 Hours',
                html: `<a href=${dns}api/verify_email_address?code=${result.code}><h3>Please Press Here to Verify Your Email Address</h3></a>` // html body
            };

            // send mail with defined transport object
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                    return res.send({message: helper.FAILED_SENDING_EMAIL});
                }
                console.log('Message %s sent: %s', info.messageId, info.response);
                return res.send(output);
            });
        } else {
            return res.send(output);
        }
    });
});

// Forget Password
app.post('/api/forget_password/', (req, res) => {
    usersModel.forgetPassword(connection, req.body, res, function(result) {
        var output = JSON.stringify(helper.stripJSON(result));
        // Send email to the user's email
        if (result.message == helper.SUCCESS) {
            // console.log(transporter);
            var mailOptions = {
                from:    emailAddress,
                to:      result.email.replace(/\'/g, ''),
                subject: '[ezLaundry] Please Use the Link to Reset Your Password Within 24 Hours',
                html: `<a href=${dns}api/reset_password?code=${result.code}><h3>Please Press Here to Reset Your Password</h3></a>` // html body
            };

            // send mail with defined transport object
            transporter.sendMail(mailOptions, (error, info) => {
                if (error) {
                    console.log(error);
                    return res.send({message: helper.FAILED_SENDING_EMAIL});
                }
                console.log('Message %s sent: %s', info.messageId, info.response);
                return res.send(output);
            });
        } else {
            return res.send(output);
        }
    });
});

// Let the user to reset password
app.get('/api/reset_password?', (req, res) => {
    usersModel.checkForgetPassword(connection, req.query, res, function(result) {
        if (result.message != helper.SUCCESS) {
            return res.send(result.message);
        }
        return res.render('reset_password.hbs',{
            message: result.message,
            username: result.username,
            code: req.query.code
        });
    });
});

// Handle reset password page
app.post('/api/reset_password', (req, res) => {
    console.log(req.body);
    usersModel.resetPassword(connection, req.body, res, function(result) {
        if (result.message != helper.SUCCESS) {
            return res.render('reset_password.hbs',{
                message: result.message,
                username: result.username
            });
        }
        return res.send(result.message);
    });
});


// Start the server
app.listen(port);
console.log(`Starting server at localhost:${port}`);
