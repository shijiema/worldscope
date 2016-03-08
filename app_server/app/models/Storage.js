/*
 * Storage class is a singleton object and acts as a facade to the storage
 * internals.
 * @module Storage
 */
'use strict';
var rfr = require('rfr');
var Promise = require('bluebird');
var Sequelize = require('sequelize');
var _ = require('underscore');

var config = rfr('config/DatabaseConfig');
var Utility = rfr('app/util/Utility');
var CustomError = rfr('app/util/Error');
var logger = Utility.createLogger(__filename);

var modelNames = ['User', 'Stream', 'View', 'Subscription', 'Comment'];

/**
 * Initialises the database connection and load the models written in
 * modelNames. Model files have to be stored in the models directory
 * @constructor
 */
function Storage() {
  var models = {};

  // initialize database connection
  var sequelize = new Sequelize(
      config.name,
      config.username,
      config.password, {
        host: config.host,
        dialect: config.dialect,
        timezone: config.timezone,
        logging: config.logging,
        define: {
          hooks: {
            beforeUpdate: isFieldsMatched
          }
        }
      });

  // importing models
  for (var i = 0; i < modelNames.length; i++) {
    var modelName = modelNames[i];
    models[modelName] = sequelize.import(__dirname + '/' + modelName);
    logger.info(modelName + ' model imported');
  }

  // associate the models
  modelNames.forEach(function(modelName) {
    var srcModel = models[modelName];
    if ('associate' in srcModel) {
      srcModel.associate(models);
    }
  });

  // create the tables
  this.dbSyncPromise = sequelize
  .sync()
  .then(function(res) {
    logger.info('Table synchronized');
    return true;
  }, function(err) {
    if (err.parent.code === 'ER_NO_SUCH_TABLE') {
      logger.info('Building table');
    } else {
      logger.error('An error occurred while synchronizing table: %j', err);
    }
    return false;
  });

  this.Sequelize = Sequelize;
  this.sequelize = sequelize;
  this.models = models;
}

var Class = Storage.prototype;

/************************************************************************
 *                                                                       *
 *                              USER API                                 *
 *                                                                       *
 *************************************************************************/

/**
 * @param  {object} particulars
 * @param  {string} particulars.username
 * @param  {string} particulars.password
 * @return {Promise<Sequelize.object> | False}
 */
Class.createUser = function(particulars) {
  return this.models.User.create(particulars)
    .then(function(user) {
      return user;
    }).catch(function(err) {
      logger.error('Error in creating user: %j', err);
      return false;
    });
};

/**
 * @param  {string} email - the user's email
 * @return {Promise<Sequelize.object> | False}
 */
Class.getUserByEmail = function(email) {
  return this.models.User.findOne({
    where: {
      email: email
    }
  }).then(function(res) {
    if (res === null) {
      logger.info('No such user');
      return false;
    } else {
      return res;
    }
  }).catch(function(err) {
    logger.error('Error in retrieving user: %j', err);
    return false;
  });
};

/**
 * @param  {string} userId
 * @return {Promise<Sequelize.object> | False}
 */
Class.getUserById = function(userId) {
  return this.models.User.findById(userId).then(function(res) {
    if (res === null) {
      logger.info('No such user: %s', userId);
      return false;
    } else {
      return res;
    }
  }).catch(function(err) {
    logger.error('Error in retrieving user: %j', err);
    return false;
  });
};

/**
 * @param  {string} platformType
 * @param  {string} platformId
 * @return {Promise<Sequelize.object> | False}
 */
Class.getUserByPlatformId = function(platformType, platformId) {
  return this.models.User.findOne({
    where: {
      platformType: platformType,
      platformId: platformId
    }
  }).then(function(res) {
    if (res === null) {
      logger.info('No such user at %s with platform id %s',
                  platformType, platformId);
      return false;
    } else {
      return res;
    }
  }).catch(function(err) {
    logger.error('Error in retrieving user: %j', err);
    return false;
  });
};

/**
 * @param  {string} username
 * @return {Promise<Sequelize.object> | False}
 */
Class.getUserByUsername = function(username) {
  return this.models.User.findOne({
    where: {
      username: username
    }
  }).then(function(res) {
    if (res === null) {
      logger.info('No user found');
      return false;
    } else {
      return res;
    }
  }).catch(function(err) {
    logger.error('Error in retrieving user: %j', err);
    return false;
  });
};

/**
 * @param  {string} username
 * @param  {string} password
 * @return {Promise<Sequelize.object> | False}
 */
Class.getUserByUsernamePassword = function(username, password) {
  return this.models.User.findOne({
    where: {
      username: username,
      password: password
    }
  }).then(function(res) {
    if (res === null) {
      logger.info('No user found');
      return false;
    } else {
      return res;
    }
  }).catch(function(err) {
    logger.error('Error in retrieving user: %j', err);
    return false;
  });
};

/**
 * @param  {string} userId
 * @return {boolean}
 */
Class.deleteUserById = function(userId) {
  return this.getUserById(userId)
    .then(function(user) {
      user.destroy();
    })
    .then(function() {
      logger.info('User deleted');
      return true;
    })
    .catch(function(err) {
      logger.error('Error in deleting user: %j', err);
      return false;
    });
};

/**
 * @param  {string} userId
 * @param  {object} newParticulars
 * @param  {string} newParticulars.username
 * @param  {string} newParticulars.password
 * @return {Promise<Sequelize.object>} on success
           {Error} on fail
 */
Class.updateUser = function(userId, newParticulars) {
  return this.getUserById(userId).then(function(user) {
    return user.update(newParticulars, {
      fields: Object.keys(newParticulars)
    });
  });
};

/**
 * @return {Promise<List<Sequelize.object>>} - a list of users
 *         {False} on fail
 */
Class.getListOfUsers = function(filters) {

  filters = mapParams(filters);

  return this.models.User.findAll({
    where: {
      permissions: null
    },
    order: [['username', filters.order]]
  }).catch(function(err) {
    logger.error('Error in fetching list of users: %j', err);
    return false;
  });
};

// TODO: Merge into getListOfUsers() after implementing filters
/**
 * @return {Promise<List<Sequelize.object>>} - a list of admins
 *         {False} on fail
 */
Class.getListOfAdmins = function(filters) {
  filters = mapParams(filters);

  return this.models.User.findAll({
    order: [['username', filters.order]],
    where: {permissions: {ne: null}}
  }).catch(function(err) {
    logger.error('Error in fetching list of users: %j', err);
    return false;
  });
};

/**
 * @return {Promise<Integer>} - total number of users in database
 *         {False} on fail
 */
Class.getNumberOfUsers = function() {
  return this.models.User.count({
    where: {
      permissions: null
    },
  }).catch(function(err) {
    logger.error('Error in counting users: %j', err);
    return false;
  });
};


/**
 * @return {Promise<Integer>} - total number of admins in database
 *         {False} on fail
 */
Class.getNumberOfAdmins = function() {
  return this.models.User.count({
    where: {
      permissions: {
        $ne: null
      }
    },
  }).catch(function(err) {
    logger.error('Error in counting admins: %j', err);
    return false;
  });
};

/************************************************************************
 *                                                                       *
 *                            STREAM API                                 *
 *                                                                       *
 *************************************************************************/

/**
 * @param  {string} userId - userid of the user who created stream
 * @param  {object} streamAttributes
 * @param  {string} streamAttributes.streamKey
 * @param  {string} streamAttributes.roomId
 * @return {Promise<Sequelize.object>}
 */
Class.createStream = function(userId, streamAttributes) {
  var userPromise = this.models.User.findById(userId);
  var streamPromise = this.models.Stream.create(streamAttributes);

  return Promise.join(userPromise, streamPromise,
      function(user, stream) {
        return user.addStream(stream).then(function() {
          return this.getStreamById(stream.streamId);
        }.bind(this));
      }.bind(this))
  .catch(function(err) {
    return Promise.reject(err);
  });

};

/**
 * Return a stream given streamId
 * @param  {string} id - stream's id
 * @return {Promise<Sequelize.object> | null}
 */
Class.getStreamById = function(streamId) {
  return this.models.Stream.findOne({
    include: [{
      model: this.models.User,
      as: 'streamer'
    }],
    where: {
      streamId: streamId
    }
  });
};

/**
 * Return a list of streams sorted with options.
 * @param  {object} filters
 * @param  {string} filters.sort
 * @param  {string} filters.state
 * @param  {object} filters.order
 * @return {Promise<List<Sequelize.object>>} - a list of streams
 */
Class.getListOfStreams = function(originalFilters) {
  // TODO: viewers

  var filters = mapParams(originalFilters);

  if (filters.sort !== 'createdAt') {
    return this.models.Stream.findAll({
      include: [{
        model: this.models.User,
        as: 'streamer'
      }],
      where: {
        live: filters.state
      },
      order: [[filters.sort, filters.order], ['createdAt', 'DESC']]
    });
  } else {
    return this.models.Stream.findAll({
      include: [{
        model: this.models.User,
        as: 'streamer'
      }],
      where: {
        live: filters.state
      },
      order: [[filters.sort, filters.order]]
    });
  }
};

/**
 * @param  {string}
 * @param  {object} newAttributes
 * @param  {string} newAttributes.username
 * @param  {string} newAttributes.password
 * @return {Promise<Sequelize.object>} on success
           {Error} on fail
 */
Class.updateStream = function(streamId, newAttributes) {
  return this.getStreamById(streamId).then(function(stream) {
    return stream.update(newAttributes, {
      fields: Object.keys(newAttributes)
    });
  });
};

/************************************************************************
 *                                                                       *
 *                              VIEW API                                 *
 *                                                                       *
 *************************************************************************/

/**
 * @param  {string} userId
 * @param  {string} streamId
 * @return {Promise<Sequelize.View>}
 */
Class.createView = function(userId, streamId) {
  var userPromise = this.models.User.findById(userId);
  var streamPromise = this.models.Stream.findById(streamId);

  return Promise.join(userPromise, streamPromise,
    function(user, stream) {
      return user.addView(stream).then((view) => view[0][0])
        .catch(err => null);
    });
};

/**
 * @param  {string} streamId
 * @return {Promise<Sequelize.Stream>} - a Stream object with a list of
 *                                       embedded users
 */
Class.getListOfUsersViewingStream = function(streamId) {
  return this.models.Stream.findOne({
    where: {
      streamId: streamId
    },
    include: [{
      model: this.models.User,
      as: 'Viewer',
      through: {
        where: {
          endedAt: null
        }
      }
    }],
    order: [[{model: this.models.User, as: 'Viewer'}, 'username', 'ASC']]
  }).then(function receiveResult(result) {
    if (result) {
      return result.Viewer; //only return the descendents
    } else {
      return null;
    }
  });
};

Class.getTotalNumberOfUsersViewedStream = function(streamId) {
  return this.models.View.count({
    where: {
      streamId: streamId,
      endedAt: null //either null or removed, depending live or not
    }
  });
};

/**
 * @param  {string} userId
 * @param  {string} streamId
 * @param  {object} newAttributes
 * @return {Promise<Sequelize.View>}
 */
/*Class.updateView = function(userId, streamId, newAttributes) {
  var userPromise = this.models.User.findById(userId);
  var streamPromise = this.models.Stream.findById(streamId);

  return this.getStreamById(streamId).then(function(stream) {
    return stream.update(newAttributes, {
      fields: Object.keys(newAttributes)
    });
  });
};*/

/************************************************************************
 *                                                                       *
 *                      SUBSCRIPTION API                                 *
 *                                                                       *
 *************************************************************************/
/**
 * @param  {string} subscribeFrom - userId of the one who want to subscribe
 * @param  {string} subscribeTo - userId of the one being subscribed to
 * @return {Promise<Sequelize.Subscription>}
 */
Class.createSubscription = function(subscribeFrom, subscribeTo) {
  var fromPromise = this.models.User.findById(subscribeFrom);
  var toPromise = this.models.User.findById(subscribeTo);

  return Promise.join(fromPromise, toPromise,
    function(from, to) {
      if (to === null || from.userId == to.userId) {
        logger.error('Subscription user cannot be found');

        return new CustomError.NotFoundError('User not found');
      }
      return from.addSubscription(to).then(res => {
        if (!res || res.length === 0) {
          logger.error('Duplicate Subscription');

          return new CustomError.DuplicateEntryError('Duplicate Subscription');
        }
        return res[0][0];
      });
    });
};

/**
 * @param  {string} userId
 * @return {Promise<List<Sequelize.Subscription>>}
 */
Class.getSubscriptions = function(userId) {
  var userPromise = this.models.User.findById(userId);

  return userPromise.then(function(user) {
    if (user === null) {
      logger.error('User cannot be found');

      return new CustomError.NotFoundError('User not found');
    }
    return user.getSubscriptions({order: [['username', 'ASC']]}).then(res => {
      return res;
    });
  });
};

/**
 * @param  {string} userId
 * @return {Promise<Integer>}
 */
Class.getNumberOfSubscriptions = function(userId) {
  var userPromise = this.models.User.findById(userId);

  return userPromise.then(function(user) {
    if (user === null) {
      logger.error('User cannot be found');

      return new CustomError.NotFoundError('User not found');
    }

    return this.models.Subscription.count({
      where: {
        subscriber: userId
      }
    });

  }.bind(this));
};

/**
 * @param  {string} userId
 * @return {Promise<List<Sequelize.Subscription>>}
 */
Class.getSubscribers = function(userId) {
  var userPromise = this.models.User.findById(userId);

  return userPromise.then(function(user) {
    if (user === null) {
      logger.error('User cannot be found');

      return new CustomError.NotFoundError('User not found');
    }
    return user.getSubscribers({order: [['username', 'ASC']]}).then(res => {
      return res;
    });
  });
};

/**
 * @param  {string} userId
 * @return {Promise<Integer>}
 */
Class.getNumberOfSubscribers = function(userId) {
  var userPromise = this.models.User.findById(userId);

  return userPromise.then(function(user) {
    if (user === null) {
      logger.error('User cannot be found');

      return new CustomError.NotFoundError('User not found');
    }

    return this.models.Subscription.count({
      where: {
        subscribeTo: userId
      }
    });

  }.bind(this));
};

/**
 * @param  {string} subscribeFrom - userId of one who is subscribing
 * @param  {string} subscribeTo - userId of the one being subscribed to
 * @return {Promise<Boolean>}
 */
Class.deleteSubscription = function(subscribeFrom, subscribeTo) {
  var fromPromise = this.models.User.findById(subscribeFrom);
  var toPromise = this.models.User.findById(subscribeTo);

  return Promise.join(fromPromise, toPromise,
    function(from, to) {
      if (from === null || to === null) {
        logger.error('User cannot be found');

        return new CustomError.NotFoundError('User not found');
      }
      return from.removeSubscription(to).then(res => {
        if (res === 1) {
          return true;
        }
        return false;
      });
    });
};

/************************************************************************
 *                                                                       *
 *                           COMMENT API                                 *
 *                                                                       *
 *************************************************************************/
 /**
 * @param  {string} userId
 * @param  {string} streamId
 * @param  {Object} commentObj
 * @param  {string} commentObj.content
 * @return {Promise<Sequelize.Comment>}
 */
Class.createComment = function(userId, streamId, commentObj) {
  var userPromise = this.models.User.findById(userId);
  var streamPromise = this.models.Stream.findById(streamId);

  return Promise.join(userPromise, streamPromise,
    function(user, stream) {
      if (user === null) {
        let errMsg = `User ${userId} cannot be found`;
        logger.error(errMsg);
        return new CustomError.NotFoundError(errMsg);
      }
      if (stream === null) {
        let errMsg = `Stream ${streamId} cannot be found`;
        logger.error(errMsg);
        return new CustomError.NotFoundError(errMsg);
      }

      var comment = {
        content: commentObj.content,
        createdAt: commentObj.createdAt,
        userId: userId,
        streamId: streamId
      };

      return this.models.Comment.create(comment).bind(this);
    }.bind(this));
};

 /**
 * @param  {string} streamId
 * @return {Promise<Sequelize.Comment>}
 */
Class.getListOfCommentsForStream = function(streamId) {

  return this.models.Stream.findOne({
    include: [{
      model: this.models.Comment,
      as: 'comments'
    }],
    where: {
      streamId: streamId
    },
    order: [[{model: this.models.Comment, as: 'comments'}, 'createdAt', 'DESC']]

  }).then(function receiveResult(result) {
    if (!result) {
      logger.error('Stream not found');

      return new CustomError.NotFoundError('Stream not found');
    } else {
      return result.comments; //only return the descendents
    }
  });

};

/**
 * Check if the fields to be changed match the fields available in object
 * @private
 */
function isFieldsMatched(user, options, fn) {
  var fieldsToChange = options.fields;
  var index = fieldsToChange.indexOf('updatedAt');
  var objFields = Object.keys(user.dataValues);

  if (index === 0) { //only change updatedAt time
    return fn();
  }

  if (_(fieldsToChange).difference(objFields).length !== 0) {
    throw new CustomError.InvalidColumnError('Column name undefined');
  } else {
    return fn();
  }
}

/**
 * Map the database query parameters
 * @private
 */
function mapParams(filters) {

  var filterMap = {
    'desc': 'DESC',
    'asc': 'ASC',
    'time': 'createdAt',
    'title': 'title',
    'all': {$or: [{'live': true}, {'live': false}]},
    'live': true,
    'done': false
  };

  for (var key in filters) {
    if (filters.hasOwnProperty(key)) {
      var value = filters[key];
      filters[key] = filterMap[value];
    }
  }

  return filters;
}

module.exports = new Storage();
