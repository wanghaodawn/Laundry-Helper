const express = require('express');
const hbs = require('hbs');
const fs = require('fs');
const url = require('url');
const moment = require('moment-timezone');
const Isemail = require('isemail');

const helper = require('./helper.js');

module.exports = {
    createUser : function (GoogleMapAPIKey, connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS, user: null});
        }
        // If any of the required fields is missing, then return
        if (!query.username) {
            return callback({message: helper.MISSING_USERNAME, user: null});
        }
        if (!query.email) {
            return callback({message: helper.MISSING_EMAIL, user: null});
        }
        if (!query.password) {
            return callback({message: helper.MISSING_PASSWORD, user: null});
        }
        if (!query.address) {
            return callback({message: helper.MISSING_ADDRESS, user: null});
        }
        if (!query.city) {
            return callback({message: helper.MISSING_CITY, user: null});
        }

        // Check whether it is an email or not
        if (!Isemail.validate(query.email)) {
            return callback({message: helper.WRONG_EMAIL_FORMAT, user: null});
        }

        var user = {
            'username':             connection.escape(helper.toLowerCase(query.username)),
            'password':             helper.hashPassword(query.username + query.password),
            'email':                connection.escape(helper.toLowerCase(query.email)),
            'has_verified_email':   0,
        };

        // console.log(user);
        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username=? OR email=?;';
        // console.log(queryString1);
        connection.query(queryString1, [user.username, user.email], function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, user: null, code: null});
            }
            var count = rows[0].COUNT;
            if (count != 0) {
                // If find dumplicate primary keys in the database, return
                return callback({message: helper.USERNAME_OR_EMAIL_HAS_BEEN_TAKEN, user: null});
            }

            var res_message = '';

            // Use escape to prevent from SQL Injection
            const address = helper.toLowerCase(query.address);
            const city = helper.toLowerCase(query.city);

            var latitude = 0.0, longitude = 0.0;

            // Get user's desired apartment's latitude and longitude
            helper.getLocation(GoogleMapAPIKey, address, city, function(res) {
                // console.log(JSON.stringify(res));
                res_message = res.message;
                // console.log(res_message);
                // console.log(helper.SUCCESS);
                // console.log(res_message == helper.SUCCESS);
                if (res_message == helper.SUCCESS) {
                    latitude = res.latitude;
                    longitude = res.longitude;
                }

                // If the address is incorrect
                if (res.message == helper.INVALID_ADDRESS) {
                    return callback({message: helper.INVALID_ADDRESS, user: null, code: null});
                }

                // Whether the user's addres has machine or not
                const queryString10 = 'SELECT landlord_id FROM landlords WHERE latitude = ? AND longitude = ?;';
                connection.query(queryString10, [latitude, longitude], function(err, rows) {
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL, user: null, code: null});
                    }

                    // console.log(rows[0].landlord_id);
                    if (rows.length == 0) {
                        return callback({message: helper.NO_MACHINE_THIS_ADDRESS, user: null, code: null});
                    }
                    user['landlord_id'] = rows[0].landlord_id;

                    // console.log(user);

                    const queryString2 = 'INSERT INTO users SET ?;';
                    connection.query(queryString2, user, function(err, rows) {
                        if (err) {
                            console.log(err);
                            return callback({message: helper.FAIL, user: null, code: null});
                        }
                        const queryString3 = 'SELECT u.username, u.email, l.property_name, u.password, u.landlord_id \
                                              FROM users u, landlords l \
                                              WHERE u.username=? AND u.landlord_id = l.landlord_id;';
                        connection.query(queryString3, user.username, function(err, rows) {
                            // console.log(err);
                            if (err) {
                                console.log(err);
                                return callback({message: helper.FAIL, user: null, code: null});
                            }
                            if (res_message == helper.ZERO_RESULTS) {
                                return callback({message: helper.ZERO_RESULTS, user: rows[0], code: null});
                            }

                            var newUser = rows[0];

                            const timestamp = moment(new Date()).tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');
                            var data = {
                                username: user.username,
                                timestamp: timestamp,
                                type: 'Email Verification'
                            }

                            const queryString4 = 'INSERT INTO email_verifications SET ?;';
                            connection.query(queryString4, data, function(err, rows) {
                                // console.log(err);
                                if (err) {
                                    console.log(err);
                                    return callback({message: helper.FAIL, user: null, code: null});
                                }

                                const queryString5 = 'SELECT id FROM email_verifications \
                                                      WHERE username = ? ORDER BY timestamp DESC LIMIT 1;';
                                connection.query(queryString5, user.username, function(err, rows) {
                                    // console.log(err);
                                    if (err) {
                                        console.log(err);
                                        return callback({message: helper.FAIL, user: null, code: null});
                                    }

                                    var id = rows[0].id;
                                    var code = helper.hashPassword(id + user.username + timestamp);

                                    const queryString6 = 'UPDATE email_verifications SET code = ? WHERE id = ?;';
                                    connection.query(queryString6, [code, id], function(err, rows) {
                                        if (err) {
                                            console.log(err);
                                            return callback({message: helper.FAIL, user: null});
                                        }
                                        return callback({message: helper.SUCCESS, user: newUser, code: code});
                                    });
                                });
                            });
                        });
                    });
                });
            });
        });
    },


    loginUser : function (connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS, user: null});
        }
        // If any of the required fields is missing, then return
        if (!query.username) {
            return callback({message: helper.MISSING_USERNAME, user: null});
        }
        if (!query.password) {
            return callback({message: helper.MISSING_PASSWORD, user: null});
        }
        // Use escape to prevent from SQL Injection
        const user = {
            'username':     connection.escape(helper.toLowerCase(query.username)),
            'password':     helper.hashPassword(query.username + query.password)
        };
        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username=?;';
        // console.log(queryString1);
        connection.query(queryString1, user.username, function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, user: null});
            }
            var count = rows[0].COUNT;
            if (count != 1) {
                // If find dumplicate primary keys in the database, return
                return callback({message: helper.USER_DOESNT_EXISTS, user: null});
            }

            const queryString2 = 'SELECT has_verified_email FROM users WHERE username = ?;';
            connection.query(queryString2, user.username, function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, user: null});
                }

                // If the user hasn't verified email, then return
                if (rows[0].has_verified_email == 0) {
                    return callback({message: helper.PLEASE_VERIFY_EMAIL_FIRST, user: null});
                }

                // If the user has verified, then continue
                const queryString3 = 'SELECT u.username, u.email, l.property_name, u.password, u.landlord_id \
                                      FROM users u, landlords l \
                                      WHERE u.username=? AND u.landlord_id = l.landlord_id';
                connection.query(queryString3, user.username, function(err, rows) {
                    // console.log(err);
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL, user: null});
                    }
                    var originalPassword = rows[0].password;
                    // console.log(originalPassword);
                    // console.log(user.password);
                    if (originalPassword != user.password) {
                        return callback({message: helper.WRONG_PASSWORD, user: null});
                    }

                    var newUser = rows[0];
                    var access_code = helper.generateAccessCode(user.username);
                    for (var i = access_code.length; i < 4; i++) {
                        access_code = '0' + access_code;
                    }
                    if (access_code.length > 4) {
                        access_code = access_code.substring(0, 4);
                    }
                    newUser['access_code'] = access_code;

                    return callback({message: helper.SUCCESS, user: newUser});
                });
            });
        });
    },


    updateUserInfo : function(GoogleMapAPIKey, connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            return callback({message: helper.MISSING_REQUIRED_FIELDS, user: null});
        }
        // Check if missing parameters or not
        if (!query.username) {
            return callback({message: helper.MISSING_USERNAME, user: null});
        }
        // if (!query.new_password) {
        //     return callback({message: helper.MISSING_NEW_PASSWORD, user: null});
        // }
        if (!query.address) {
            return callback({message: helper.MISSING_ADDRESS, user: null});
        }
        if (!query.city) {
            return callback({message: helper.MISSING_CITY, user: null});
        }

        var user = {
            'username': connection.escape(helper.toLowerCase(query.username)),
            'new_password': helper.hashPassword(query.username + query.new_password)
        }
        var address =  helper.toLowerCase(query.address);
        var city = helper.toLowerCase(query.city);

        var latitude = 0.0;
        var longitude = 0.0;
        helper.getLocation(GoogleMapAPIKey, address, city, function(res) {
            if (res.message == helper.INVALID_ADDRESS) {
                return callback({message: helper.INVALID_ADDRESS});
            }

            if (res.message == helper.SUCCESS) {
                latitude = res.latitude;
                longitude = res.longitude;
            }

            // Check whether the latitude and longitude is in the Database
            const queryString1 = 'SELECT landlord_id FROM landlords WHERE latitude = ? AND longitude = ?;';
            connection.query(queryString1, [latitude, longitude], function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, user: null});
                }

                if (rows.length == 0) {
                    return callback({message: helper.NO_MACHINE_THIS_ADDRESS, user: null});
                }

                user['landlord_id'] = rows[0].landlord_id;
                // console.log(user);
                // Update user table
                const queryString2 = 'UPDATE users SET password = ?, landlord_id = ? WHERE username = ?;';
                connection.query(queryString2, [user.new_password, user.landlord_id, user.username], function(err, rows) {
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL});
                    }

                    const queryString3 = 'SELECT u.username, u.email, l.property_name, u.password, u.landlord_id \
                                          FROM users u, landlords l \
                                          WHERE u.username=? AND u.landlord_id = l.landlord_id;';
                    connection.query(queryString3, user.username, function(err, rows) {
                        // console.log(err);
                        if (err) {
                            console.log(err);
                            return callback({message: helper.FAIL, user: null});
                        }
                        return callback({message: helper.SUCCESS, user: rows[0]});
                    });
                });
            });
        });
    },



    deleteOneUser : function(connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            return callback({message: helper.MISSING_REQUIRED_FIELDS});
        }
        // Use escape to prevent from SQL Injection
        const user = {
            'username': connection.escape(helper.toLowerCase(query.username))
        };
        // console.log(user);
        if (query.username) {
            // Delete one user
            const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username=?;';
            connection.query(queryString1, user.username, function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL});
                }
                var count = rows[0].COUNT;
                if (count != 1) {
                    // If cannot find the item,then return
                    return callback({message: helper.ITEM_DOESNT_EXIST});
                }
                const queryString2 = 'DELETE FROM users WHERE username=?;';
                connection.query(queryString2, user.username, function(err, rows) {
                    if (err) {
                        // Fail, return
                        console.log(err);
                        return callback({message: helper.FAIL});
                    }
                    // Success
                    return callback({message: helper.SUCCESS});
                });
            });
        } else {
            // If any of the required fields is missing, then return
            return callback({message: helper.MISSING_USERNAME});
        }
    },



    deleteAllUsers : function(connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            return callback({message: helper.MISSING_REQUIRED_FIELDS});
        }
        // Use escape to prevent from SQL Injection
        const user = {
            'delete_all': connection.escape(helper.toLowerCase(query.delete_all))
        };
        // console.log(user);
        if (query.delete_all && query.delete_all.toLowerCase() == 'true') {
            // Delete all users
            const queryString = 'DELETE FROM users;';
            connection.query(queryString, function(err, rows) {
                if (err) {
                    // Fail, return
                    console.log(err);
                    return callback({message: helper.FAIL});
                }
                // Success
                return callback({message: helper.SUCCESS});
            });
        } else {
            // If any of the required fields is missing, then return
            return callback({message: helper.MISSING_DELETE_ALL});
        }
    },



    // Show all users
    showAllUsers : function (connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            return callback({message: helper.MISSING_REQUIRED_FIELDS, user: null});
        }
        // Use escape to prevent from SQL Injection
        const schedule = {
            'show_all': connection.escape(helper.toLowerCase(query.show_all))
        };
        // console.log(machine);
        if (query.show_all && query.show_all.toLowerCase() == 'true') {
            // Delete all machines
            const queryString = 'SELECT * FROM users;';
            connection.query(queryString, function(err, rows) {
                if (err) {
                    // Fail, return
                    console.log(err);
                    return callback({message: helper.FAIL, user: null});
                }
                // Success
                result = helper.

                Users(rows);
                return callback({message: helper.SUCCESS, user: result});
            });
        } else {
            // If any of the required fields is missing, then return
            return callback({message: helper.MISSING_SHOW_ALL, user: null});
        }
    },



    login : function (connection, username, password, callback) {
        username = connection.escape(helper.toLowerCase(username));
        password = connection.escape(password);
        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username=?;';
        // console.log(queryString1);
        connection.query(queryString1, username, function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, user: null});
            }
            var count = rows[0].COUNT;
            if (count != 1) {
                // If find dumplicate primary keys in the database, return
                return callback({message: helper.USER_DOESNT_EXISTS, user: null});
            }
            // console.log(username);
            // console.log(password);
            const queryString2 = 'SELECT * FROM users WHERE username=?;';
            connection.query(queryString2, username, function(err, rows) {
                // console.log(err);
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, user: null});
                }
                var originalPassword = rows[0].password;
                console.log(originalPassword);
                console.log(password);
                if (originalPassword != password) {
                    return callback({message: helper.WRONG_PASSWORD, user: null});
                }
                return callback({message: helper.SUCCESS, user: rows[0]});
            });
        });
    },



    register : function (connection, inputUser, callback) {
        const user = {
            'username':     connection.escape(helper.toLowerCase(inputUser.username)),
            'firstname':    connection.escape(helper.toLowerCase(inputUser.firstname)),
            'lastname':     connection.escape(helper.toLowerCase(inputUser.lastname)),
            'password':     connection.escape(inputUser.password),
            'address':      connection.escape(helper.toLowerCase(inputUser.address)),
            'zip':          connection.escape(helper.toLowerCase(inputUser.zip)),
            'city':         connection.escape(helper.toLowerCase(inputUser.city)),
            'state':        connection.escape(helper.toLowerCase(inputUser.state)),
            'country':      connection.escape(helper.toLowerCase(inputUser.country))
        };
        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username=?;';
        // console.log(queryString1);
        connection.query(queryString1, user.username, function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, user: null});
            }
            var count = rows[0].COUNT;
            if (count != 0) {
                // If find dumplicate primary keys in the database, return
                return callback({message: helper.USERNAME_HAS_BEEN_TAKEN, user: null});
            }
            const queryString2 = 'INSERT INTO users SET ?;';
            connection.query(queryString2, user, function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, user: null});
                }
                const queryString3 = 'SELECT * FROM users WHERE username=?;';
                connection.query(queryString3, user.username, function(err, rows) {
                    // console.log(err);
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL, user: null});
                    }
                    return callback({message: helper.SUCCESS, user: rows[0]});
                });
            });
        });
    },




    changeInfo : function (connection, inputUser, originalUser, callback) {
        const password = connection.escape(inputUser.password);
        const newPassword = connection.escape(inputUser.newPassword);
        const confirmPassword = connection.escape(inputUser.confirmPassword);
        const username = connection.escape(originalUser.username);
        // console.log(username);
        if (newPassword != confirmPassword) {
            return callback({message: helper.TWO_PASSWORDS_DOESNT_MATCH, user: originalUser});
        }
        this.login(connection, originalUser.username, inputUser.password, function(result) {
            // console.log(result);
            if (result.message != helper.SUCCESS) {
                return callback({message: helper.WRONG_PASSWORD, user: originalUser});
            }
            // If the password is correct, then update the user's info
            const user = {
                'firstname':        connection.escape(helper.toLowerCase(inputUser.firstname)),
                'lastname':         connection.escape(helper.toLowerCase(inputUser.lastname)),
                'password':         connection.escape(newPassword),
                'address':          connection.escape(helper.toLowerCase(inputUser.address)),
                'zip':              connection.escape(helper.toLowerCase(inputUser.zip)),
                'city':             connection.escape(helper.toLowerCase(inputUser.city)),
                'state':            connection.escape(helper.toLowerCase(inputUser.state)),
                'country':          connection.escape(helper.toLowerCase(inputUser.country))
            };
            const queryString2 = 'UPDATE users SET ? WHERE username=?;';
            connection.query(queryString2, [user, username], function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, user: originalUser});
                }
                const queryString3 = 'SELECT * FROM users WHERE username=?;';
                connection.query(queryString3, username, function(err, rows) {
                    // console.log(err);
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL, user: originalUser});
                    }
                    return callback({message: helper.SUCCESS, user: stripUser(rows[0])});
                });
            });
        });
    },



    verifyEmailAddress : function (connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS});
        }
        // If any of the required fields is missing, then return
        if (!query.code) {
            return callback({message: helper.MISSING_CODE});
        }

        // Prevent SQL Injection
        if (/[^a-zA-Z0-9]/.test(query.code)) {
            return callback({message: helper.WRONG_CODE});
        }
        const queryString1 = 'SELECT id, username, timestamp, type FROM email_verifications WHERE code = ?';
        connection.query(queryString1, query.code, function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL});
            }

            if (rows.length != 1 || rows[0].type != 'Email Verification') {
                return callback({message: helper.WRONG_CODE});
            }
            var id = rows[0].id;
            var username = rows[0].username;
            var timestamp = rows[0].timestamp;
            var timestampAfter24hours = moment(timestamp).add(1, 'day').tz("America/New_York");
            var currentTime = moment(new Date()).tz("America/New_York");

            if (currentTime.isAfter(timestampAfter24hours)) {
                // This code has expired
                return callback({message: helper.EXPIRED_CODE});
            }

            // Only keep the latest email as valid, others are expired
            const queryString2 = 'SELECT code from email_verifications \
                                  WHERE username = ? ORDER BY timestamp DESC LIMIT 1;';
            connection.query(queryString2, username, function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL});
                }

                if (rows[0].code != query.code) {
                    // This code has expired
                    return callback({message: helper.EXPIRED_CODE});
                }

                const queryString3 = 'SELECT has_verified_email FROM users WHERE username = ?;';
                connection.query(queryString3, username, function(err, rows) {
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL});
                    }

                    if (rows[0].has_verified_email != 0) {
                        return callback({message: helper.EMAIL_HAS_ALREADY_BEEN_VERIFIED});
                    }

                    const queryString4 = 'UPDATE users SET has_verified_email = 1 WHERE username = ?;';
                    connection.query(queryString4, username, function(err, rows) {
                        if (err) {
                            console.log(err);
                            return callback({message: helper.FAIL});
                        }

                        // Set the code as expired by changing the timestamp by one day
                        var timestampBefore24hours = moment(timestamp).subtract(1, 'day').tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');
                        const queryString5= 'UPDATE email_verifications SET timestamp = ? WHERE id = ?;';
                        connection.query(queryString5, [timestampBefore24hours, id], function(err, rows) {
                            if (err) {
                                console.log(err);
                                return callback({message: helper.FAIL});
                            }
                            return callback({message: helper.SUCCESS});
                        });
                    });
                });
            });
        });
    },


    reverifyEmailAddress : function (connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS, email: null});
        }
        // If any of the required fields is missing, then return
        if (!query.username) {
            return callback({message: helper.MISSING_USERNAME, email: null});
        }

        const username = connection.escape(helper.toLowerCase(query.username));

        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username=?;';
        // console.log(queryString1);
        connection.query(queryString1, username, function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, email: null, code: null});
            }
            var count = rows[0].COUNT;
            if (count != 1) {
                return callback({message: helper.USER_DOESNT_EXISTS, email: null, code: null});
            }

            const queryString2 = 'SELECT email FROM users WHERE username = ?;';
            connection.query(queryString2, username, function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, email: null, code: null});
                }
                const email = rows[0].email;

                const timestamp = moment(new Date()).tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');
                var data = {
                    username: username,
                    timestamp: timestamp,
                    type: 'Email Verification'
                }

                const queryString3 = 'INSERT INTO email_verifications SET ?;';
                connection.query(queryString3, data, function(err, rows) {
                    // console.log(err);
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL, email: null, code: null});
                    }

                    const queryString4 = 'SELECT id FROM email_verifications \
                                          WHERE username = ? AND type = "Email Verification" ORDER BY timestamp DESC LIMIT 1;';
                    connection.query(queryString4, username, function(err, rows) {
                        // console.log(err);
                        if (err) {
                            console.log(err);
                            return callback({message: helper.FAIL, email: null, code: null});
                        }

                        var id = rows[0].id;
                        var code = helper.hashPassword(id + username + timestamp);

                        const queryString5 = 'UPDATE email_verifications SET code = ? WHERE id = ?;';
                        connection.query(queryString5, [code, id], function(err, rows) {
                            if (err) {
                                console.log(err);
                                return callback({message: helper.FAIL, email: null, code: null});
                            }
                            return callback({message: helper.SUCCESS, email: email, code: code});
                        });
                    });
                });
            });
        });
    },


    forgetPassword : function (connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS, email: null, code: null});
        }
        // If any of the required fields is missing, then return
        if (!query.username) {
            return callback({message: helper.MISSING_USERNAME, email: null, code: null});
        }
        if (!query.email) {
            return callback({message: helper.MISSING_EMAIL, email: null, code: null});
        }

        // Check whether it is an email or not
        if (!Isemail.validate(query.email)) {
            return callback({message: helper.WRONG_EMAIL_FORMAT, user: null});
        }

        const username = connection.escape(helper.toLowerCase(query.username));
        const email = connection.escape(helper.toLowerCase(query.email));

        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username=? AND email=?;';
        // console.log(queryString1);
        connection.query(queryString1, [username, email], function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, user: null, email: null, code: null});
            }
            var count = rows[0].COUNT;
            if (count != 1) {
                // If find dumplicate primary keys in the database, return
                return callback({message: helper.USER_DOESNT_EXISTS, email: null, code: null});
            }

            const queryString2 = 'SELECT email FROM users WHERE username = ?;';
            connection.query(queryString2, username, function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, email: null, code: null});
                }
                const email = rows[0].email;

                const timestamp = moment(new Date()).tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');
                var data = {
                    username: username,
                    timestamp: timestamp,
                    type: 'Forget Password'
                }

                const queryString3 = 'INSERT INTO email_verifications SET ?;';
                connection.query(queryString3, data, function(err, rows) {
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL, email: null, code: null});
                    }

                    const queryString4 = 'SELECT id FROM email_verifications \
                                          WHERE username = ? ORDER BY timestamp DESC LIMIT 1;';
                    connection.query(queryString4, username, function(err, rows) {
                        // console.log(err);
                        if (err) {
                            console.log(err);
                            return callback({message: helper.FAIL, email: null, code: null});
                        }

                        var id = rows[0].id;
                        var code = helper.hashPassword(id + username + timestamp);

                        const queryString5 = 'UPDATE email_verifications SET code = ? WHERE id = ?;';
                        connection.query(queryString5, [code, id], function(err, rows) {
                            if (err) {
                                console.log(err);
                                return callback({message: helper.FAIL, email: null, code: null});
                            }
                            return callback({message: helper.SUCCESS, email: email, code: code});
                        });
                    });
                });
            });
        });
    },




    checkForgetPassword : function (connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS, username: null});
        }
        // If any of the required fields is missing, then return
        if (!query.code) {
            return callback({message: helper.MISSING_CODE, username: null});
        }

        // Prevent SQL Injection
        if (/[^a-zA-Z0-9]/.test(query.code)) {
            return callback({message: helper.WRONG_CODE, username: null});
        }

        const queryString1 = 'SELECT id, username, timestamp, type FROM email_verifications WHERE code = ?';
        connection.query(queryString1, query.code, function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, username: null});
            }

            if (rows.length != 1 || rows[0].type != 'Forget Password') {
                return callback({message: helper.WRONG_CODE, username: null});
            }
            var username = rows[0].username;

            // Only keep the latest email as valid, others are expired
            const queryString2 = 'SELECT code, timestamp from email_verifications \
                                  WHERE username = ? AND type = "Forget Password" ORDER BY timestamp DESC LIMIT 1;';
            connection.query(queryString2, username, function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL});
                }

                if (rows[0].code != query.code) {
                    // This code has expired
                    return callback({message: helper.EXPIRED_CODE});
                }

                var id = rows[0].id;
                var timestampAfter24hours = moment(rows[0].timestamp).add(1, 'day').tz("America/New_York");
                var currentTime = moment(new Date()).tz("America/New_York");

                if (currentTime.isAfter(timestampAfter24hours)) {
                    // This code has expired
                    return callback({message: helper.EXPIRED_CODE, username: null});
                }

                // Set the code as expired by changing the timestamp by one day
                var timestampBefore24hours = moment(rows[0].timestamp).subtract(1, 'day').tz("America/New_York").format('YYYY-MM-DD HH:mm:ss');
                const queryString4 = 'UPDATE email_verifications SET timestamp = ? WHERE id = ?;';
                connection.query(queryString4, [timestampBefore24hours, id], function(err, rows) {
                    if (err) {
                        console.log(err);
                        return callback({message: helper.FAIL, username: null});
                    }
                    return callback({message: helper.SUCCESS, username: username});
                });
            });
        });
    },


    resetPassword : function (connection, query, res, callback) {
        // console.log(query);
        if (JSON.stringify(query) == '{}') {
            // console.log('null_query');
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS, username: null});
        }
        // If any of the required fields is missing, then return
        if (!query.password1) {
            return callback({message: helper.MISSING_NEW_PASSWORD, username: null});
        }
        if (!query.password2) {
            return callback({message: helper.MISSING_CONFIRMED_PASSWORD, username: null});
        }
        if (!query.username) {
            return callback({message: helper.MISSING_USERNAME, username: null});
        }

        if (query.password1 != query.password2) {
            return callback({message: helper.TWO_PASSWORDS_DOESNT_MATCH, username: null});
        }

        const user = {
            'username':     query.username,
            'password':     helper.hashPassword(query.username.replace(/\'/g, '') + query.password1)
        };

        // Check password length
        if (query.password1.length < 6 || query.password1.length > 20) {
            return callback({message: helper.PASSWORD_LENGTH_ERROR, username: query.username});
        }

        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username = ?;';
        connection.query(queryString1, query.username, function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL, username: query.username});
            }

            // console.log(rows);
            if (rows[0].COUNT != 1) {
                return callback({message: helper.USER_DOESNT_EXISTS, username: query.username});
            }

            const queryString2 = 'UPDATE users SET password = ? WHERE username = ?;';
            connection.query(queryString2, [user.password, user.username], function(err, rows) {
                if (err) {
                    console.log(err);
                    return callback({message: helper.FAIL, username: query.username});
                }
                return callback({message: helper.SUCCESS, username: query.username});
            });
        });
    },


    checkOldPassword : function (connection, query, res, callback) {
        if (JSON.stringify(query) == '{}') {
            // Fail, return
            return callback({message: helper.MISSING_REQUIRED_FIELDS});
        }
        // If any of the required fields is missing, then return
        if (!query.username) {
            return callback({message: helper.MISSING_USERNAME});
        }
        if (!query.old_password) {
            return callback({message: helper.MISSING_PASSWORD});
        }

        const username = connection.escape(helper.toLowerCase(query.username));
        const password1 = helper.hashPassword(query.username + query.old_password);
        const queryString1 = 'SELECT COUNT(*) AS COUNT FROM users WHERE username = ? AND password = ?;';
        connection.query(queryString1, [username, password1], function(err, rows) {
            if (err) {
                console.log(err);
                return callback({message: helper.FAIL});
            }

            if (rows[0].COUNT != 1) {
                return callback({message: helper.NOT_EQUAL});
            }
            return callback({message: helper.EQUAL});
        });
    }
};


function stripUser (user) {
    user.username = helper.stripString(user.username);
    user.firstname = helper.stripString(user.firstname);
    user.lastname = helper.stripString(user.lastname);
    user.address = helper.stripString(user.address);
    user.zip = helper.stripString(user.zip);
    user.city = helper.stripString(user.city);
    user.state = helper.stripString(user.state);
    user.country = helper.stripString(user.country);
    return user;
}
