/**
 * @constructor
 * @class
 * The User class is a local representation of a user in the MagnetMax platform. This class provides
 * various user specific methods, like authentication, signing up, and search.
 * @param {object} [userObj] An object containing user information.
 * @param {string} [userObj.userName] User's username.
 * @param {string} [userObj.password] User's preferred password.
 * @param {string} [userObj.firstName] User's first name.
 * @param {string} [userObj.lastName] User's last name.
 * @param {string} [userObj.email] User's email.
 * @property {string} userId User's user identifier.
 * @property {string} userName User's username.
 * @property {string} [firstName] User's first name.
 * @property {string} [lastName] User's last name.
 * @property {string} [email] User's email.
 */
MagnetJS.User = function(userObj) {
    if (userObj.displayName == 'null null') delete userObj.displayName;

    if (userObj.displayName) {
        var name = userObj.displayName.split(' ');
        if (!userObj.firstName) userObj.firstName = (name[0]) ? name[0] : '';
        if (!userObj.lastName) userObj.lastName = (name[1]) ? name[1] : '';
    }

    if (userObj.userId && userObj.userId.indexOf('%') != -1)
        userObj.userId = userObj.userId.split('%')[0];

    if (!userObj.userId && userObj.userIdentifier) userObj.userId = userObj.userIdentifier;
    delete userObj.userIdentifier;
    userObj.userName = userObj.userName || userObj.username || userObj.displayName;

    MagnetJS.Utils.mergeObj(this, userObj);
    return this;
};

/**
 * Registers a new user.
 * @param {object} userObj An object containing user information.
 * @param {string} userObj.userName User's username.
 * @param {string} userObj.password User's preferred password.
 * @param {string} [userObj.firstName] User's first name.
 * @param {string} [userObj.lastName] User's last name.
 * @param {string} [userObj.email] User's email.
 * @returns {MagnetJS.Promise} A promise object returning the new {MagnetJS.User} or reason of failure.
 */
MagnetJS.User.register = function(userObj) {
    userObj.userName = userObj.userName || userObj.username;
    var auth;

    MagnetJS.MMXClient.disconnect();

    if (MagnetJS.App.catCredentials || MagnetJS.App.hatCredentials)
        auth = {
            'Authorization': 'Bearer '
            + (MagnetJS.App.catCredentials || MagnetJS.App.hatCredentials || {}).access_token
        };

    var def = MagnetJS.Request({
        method: 'POST',
        url: '/com.magnet.server/user/enrollment',
        data: userObj,
        headers: auth
    }, function(newUserObj, details) {
        def.resolve.apply(def, [new MagnetJS.User(newUserObj), details]);
    }, function() {
        def.reject.apply(def, arguments);
    });
    return def.promise;
};

/**
 * Login as the given user.
 * @param {object} userObj An object containing user information.
 * @param {string} userObj.userName User's username.
 * @param {string} userObj.password User's preferred password.
 * @returns {MagnetJS.Promise} A promise object returning success report or reason of failure.
 */
MagnetJS.User.login = function(userObj) {
    userObj = userObj || {};
    userObj.grant_type = 'password';
    userObj.client_id = MagnetJS.App.clientId;
    userObj.remember_me = userObj.remember_me || false;
    userObj.username = userObj.userName || userObj.username;

    MagnetJS.MMXClient.disconnect();

    var def = MagnetJS.Request({
        method: 'POST',
        url: '/com.magnet.server/user/session',
        data: userObj,
        contentType: 'application/x-www-form-urlencoded',
        headers: {
           'Authorization': 'Basic ' + MagnetJS.Utils.stringToBase64(userObj.userName+':'+userObj.password),
           'MMS-DEVICE-ID': MMS_DEVICE_ID
        },
        isLogin: true
    }, function(data) {

        MagnetJS.App.hatCredentials = data;
        mCurrentUser = new MagnetJS.User(data.user);
        Cookie.create('magnet-max-auth-token', data.access_token, 2);

        if (data.refresh_token)
            Cookie.create('magnet-max-refresh-token', data.access_token, 365);

        MagnetJS.MMXClient.registerDeviceAndConnect(data.access_token)
            .success(function() {
                def.resolve.apply(def, arguments);
            })
            .error(function() {
                def.reject.apply(def, arguments);
            });

    }, function(e, details) {
        def.reject(details.status == 401 ? 'incorrect credentials' : e, details);
    });

    return def.promise;
};

/**
 * Login automatically if the Remember Me setting was enabled during login.
 * @returns {MagnetJS.Promise} A promise object returning success report or reason of failure.
 * @ignore
 */
MagnetJS.User.loginWithRefreshToken = function(request, callback, failback) {
    var token = Cookie.get('magnet-max-refresh-token');

    MagnetJS.MMXClient.disconnect();

    var def = MagnetJS.Request({
        method: 'POST',
        url: '/com.magnet.server/user/newtoken',
        data: {
            client_id: MagnetJS.App.clientId,
            refresh_token: token,
            grant_type: 'refresh_token',
            device_id: MMS_DEVICE_ID,
            scope: 'user'
        },
        isLogin: true
    }, function(data) {

        MagnetJS.App.hatCredentials = data;
        mCurrentUser = new MagnetJS.User(data.user);
        Cookie.create('magnet-max-auth-token', data.access_token, 1);

        MagnetJS.MMXClient.registerDeviceAndConnect(data.access_token)
            .success(function() {
                if (request) return MagnetJS.Request(request, callback, failback);
                def.resolve.apply(def, arguments);
            })
            .error(function() {
                def.reject.apply(def, arguments);
            });

    }, function(e, details) {
        Cookie.remove('magnet-max-refresh-token');
        def.reject(details.status == 401 ? 'incorrect credentials' : e, details);
    });

    return def.promise;
};

/**
 * Attempts to login with an access token.
 * @param {function} callback fires upon completion.
 * @ignore
 */
MagnetJS.User.loginWithAccessToken = function(callback) {
    var token = Cookie.get('magnet-max-auth-token');
    if (!token) return callback('auth token missing');

    MagnetJS.App.hatCredentials = {
        access_token: token
    };

    Max.User.getUserInfo().success(function(user) {
        mCurrentUser = user;

        MagnetJS.MMXClient.registerDeviceAndConnect(token)
            .success(function() {
                callback();
            })
            .error(function(e) {
                callback(e);
            });

    }).error(function(e) {
        callback(e);
    });
};


/**
 * Given a list of usernames, return a list of users.
 * @param {string[]} usernames A list of usernames.
 * @returns {MagnetJS.Promise} A promise object returning a list of {MagnetJS.User} or reason of failure.
 */
MagnetJS.User.getUsersByUserNames = function(usernames) {
    var qs = '', userlist = [];

    if (usernames && usernames.length) {
        for (var i=0;i<usernames.length;++i) {
            qs += '&userNames=' + usernames[i];
        }
        qs = qs.replace('&', '?');
    }

    var def = MagnetJS.Request({
        method: 'GET',
        url: '/com.magnet.server/user/users' + qs
    }, function(data, details) {
        for (var i=0;i<data.length;++i)
            userlist.push(new MagnetJS.User(data[i]));

        def.resolve(userlist, details);
    }, function() {
        def.reject.apply(def, arguments);
    });

    return def.promise;
};

/**
 * Search for users with an advanced search query.
 * @param {object} [queryObj] A search query object.
 * @param {object} [queryObj.query] An object containing the user property and the search value as a key-value pair.
 * For example, to search for a user by username, the object can be {userName:'jon.doe'}. See {MagnetJS.User} properties
 * for acceptable search properties.
 * @param {number} [queryObj.limit] The number of results to return per page.
 * @param {number} [queryObj.offset] The starting index of results.
 * @param {object} [queryObj.orderby] An object containing the user property and the sort direction
 * ['asc', 'desc'] as a key-value pair. For example, to order by username descending, the object can be
 * {userName:'desc'}. See {MagnetJS.User} properties for acceptable search properties.
 * @returns {MagnetJS.Promise} A promise object returning a list of {MagnetJS.User} or reason of failure.
 */
MagnetJS.User.search = function(queryObj) {
    var qs = '', userlist = [];
    var keyMap = {
        query: 'q',
        limit: 'take',
        offset: 'skip',
        orderby: 'sort'
    };

    queryObj = queryObj || {};
    queryObj.offset = queryObj.offset || 0;
    queryObj.limit = queryObj.limit || 1;
    queryObj.query = queryObj.query || {userName : '*'};

    if (queryObj.query.userId)
        queryObj.query.userIdentifier = queryObj.query.userId;
    if (queryObj.orderby && queryObj.orderby.userId)
        queryObj.orderby.userIdentifier = queryObj.orderby.userId;

    for(var key in queryObj) {
        if (typeof queryObj[key] === 'string' ||
            typeof queryObj[key] === 'number' ||
            typeof queryObj[key] === 'boolean') {
            qs += '&'+keyMap[key]+'='+queryObj[key];
        } else if (queryObj[key] && typeof queryObj[key] == 'object') {
            for (var propKey in queryObj[key]) {
                if (propKey !== 'userId')
                    qs += '&'+keyMap[key]+'='+propKey+':'+queryObj[key][propKey];
            }

        }
    }
    qs = qs != '' ? qs.replace('&', '?') : qs;

    var def = MagnetJS.Request({
        method: 'GET',
        url: '/com.magnet.server/user/query'+qs,
        bypassReady: queryObj.bypassReady
    }, function(data, details) {
        for (var i=0;i<data.length;++i)
            userlist.push(new MagnetJS.User(data[i]));

        def.resolve(userlist, details);
    }, function() {
        def.reject.apply(def, arguments);
    });

    return def.promise;
};

// TODO: not used
MagnetJS.User.getToken = function() {
    var def = MagnetJS.Request({
        method: 'GET',
        url: '/com.magnet.server/tokens/token'
    }, function() {
        def.resolve.apply(def, arguments);
    }, function() {
        def.reject.apply(def, arguments);
    });
    return def.promise;
};

/**
 * Gets the current {MagnetJS.User} object.
 * @returns {MagnetJS.Promise} A promise object returning the current user as a {MagnetJS.User} or reason of failure.
 * @ignore
 */
MagnetJS.User.getUserInfo = function() {
    var def = MagnetJS.Request({
        method: 'GET',
        url: '/com.magnet.server/userinfo',
        bypassReady: true
    }, function(data, details) {
        def.resolve.apply(def, [new MagnetJS.User(data), details]);
    }, function() {
        def.reject.apply(def, arguments);
    });
    return def.promise;
};

/**
 * Logout the current logged in user.
 * @returns {MagnetJS.Promise} A promise object returning success report or reason of failure.
 */
MagnetJS.User.logout = function() {
    var self = this;
    Cookie.remove('magnet-max-refresh-token');
    MagnetJS.MMXClient.disconnect();

    var def = MagnetJS.Request({
        method: 'DELETE',
        url: '/com.magnet.server/user/session'
    }, function() {
        self.clearSession();
        def.resolve.apply(def, arguments);
    }, function() {
        self.clearSession();
        def.reject.apply(def, arguments);
    });
    return def.promise;
};

/**
 * Removes user session information.
 * @ign
 */
MagnetJS.User.clearSession = function() {
    mCurrentUser = null;
    MagnetJS.App.hatCredentials = null;
    Cookie.remove('magnet-max-auth-token');
};
