'use strict';

/* Services */
angular.module('podcasts.services', ['podcasts.utilities', 'podcasts.queueList', 'podcasts.models'])
    .service('url', ['$window', function($window) {
        return {
            url: $window.URL || $window.webkitURL,
            createObjectUrl: function(data) {
                return this.url.createObjectURL(data);
            }
        };
    }])
    .service('player', ['db', 'url', '$timeout', 'feedItems', '$rootScope', function(db, url, $timeout, feedItems, $rootScope) {
        var audio = new Audio();
        audio.setAttribute("mozaudiochannel", "content");
        var currentFeedItem = null;
        var nowPlaying = {position: 0, duration: 0, title: '', description: '', feed: '', date: 0};

        var acm = navigator.mozAudioChannelManager;

        if (acm) {
            acm.addEventListener('headphoneschange', function onheadphoneschange() {
                if (!acm.headphones && playing()) {
                    pause();
                }
            });
        }

        function play(feedItem, $scope)
        {
            console.log('playing: ' + feedItem.title);
            var delayPlay = false;

            if (feedItem) {
                currentFeedItem = feedItem;
                var audioSrc;

                if (feedItem.audio) {
                    console.log('Playing audio from download');
                    audioSrc = url.createObjectUrl(feedItem.audio);
                } else {
                    console.log('Playing audio from web');
                    audioSrc = feedItem.audioUrl;
                }

                audio.src = audioSrc;
                updateSong(feedItem, $scope);

                if (feedItem.position) {
                    delayPlay = true;
                    angular.element(audio).bind('canplay', function(event) {
                        this.currentTime = feedItem.position;

                        angular.element(this).unbind('canplay');

                        audio.play();
                    });
                }
            }

            if (!delayPlay) {
                audio.play();
            }

            // TODO: add something here for when audio is done to remove from queue and go to next song
            audio.addEventListener("ended", function(event) {
                var nextFeedItemPromise = feedItems.getNextInQueue(feedItem);
                console.log('got promise for next feed item');
                $rootScope.$apply(nextFeedItemPromise.then(function(nextFeedItem) {
                    console.log('Got next Feed Item:');
                    console.log(nextFeedItem);
                    console.log(nextFeedItem.title);
                    play(nextFeedItem, $scope);

                    feedItem.queued = 0;
                    feedItem.position = 0;
                    db.put("feedItem", feedItem);
                }, function(error) {
                    console.log('got Errror when fetching next feed item');

                    feedItem.queued = 0;
                    feedItem.position = 0;
                    db.put("feedItem", feedItem);
                }));

                angular.element(this).unbind();
            });

            //TODO: handle save when feedItem is not passed in
            angular.element(audio).bind('pause', function(event) {
                console.log('paused audio');
                feedItem.position = Math.floor(event.target.currentTime);
                db.put("feedItem", feedItem);

                angular.element(this).unbind();
            });
        }

        function pause()
        {
            audio.pause();
        }

        function playing()
        {
            return !audio.paused;
        }

        function updateSong(feedItem, $scope)
        {
            nowPlaying.title = feedItem.title;
            /*$timeout(function() {
             player.nowPlaying.duration = audio.duration;
             }, 100);*/
            nowPlaying.currentFeedItem = feedItem;
            nowPlaying.description = feedItem.description;
            nowPlaying.feed = feedItem.feed;
            nowPlaying.date = feedItem.date;
            updatePosition($scope);
        }

        function updatePosition($scope)
        {
            setInterval(function() {
                nowPlaying.position = audio.currentTime;
                $scope.$apply();
            }, 1000);
        }


        return {
            audio: audio,
            feedItem: currentFeedItem,
            nowPlaying: nowPlaying,
            play: play,
            pause: pause,
            playing: playing,
            updateSong: updateSong,
            updatePosition: updatePosition
        }
    }])
    .service('pageSwitcher', ['$location', '$route', function($location, $route) {
        return {
            //TODO: change these getElementById's to something else
            pageSwitcher: document.getElementById('pageSwitcher'),
            pages: ['queue', 'settings', 'feeds'],
            $route: $route,
            currentPage: null,
            backPage: null,
            change: function(current) {
                this.currentPage = current;
                var nextPage = this.getNextPage(this.currentPage);

                angular.element(document.getElementById('pageswitch-icon-' + this.currentPage))
                    .addClass('next').removeClass('next1 next2');
                angular.element(document.getElementById('pageswitch-icon-' + nextPage))
                    .addClass('next1').removeClass('next next2');
                angular.element(document.getElementById('pageswitch-icon-' + this.getNextPage(nextPage)))
                    .addClass('next2').removeClass('next next1');
            },
            setBack: function(backPage) {
                this.backPage = backPage;
            },
            getNextPage: function(current) {
                var nextPage,
                    pages = this.pages,
                    validRoute = false;

                angular.forEach(pages, function(value, key) {
                    if (current === value) {
                        var nextKey = key + 1;
                        if (pages[nextKey]) {
                            nextPage = pages[nextKey];
                        } else {
                            nextPage = pages[0];
                        }
                    }
                });

                angular.forEach(this.$route.routes, function(value, key) {
                    if (key === '/' + nextPage) {
                        validRoute = true;
                    }
                });
                if (!validRoute) {
                    console.error('no valid route found for pageSwitcher: ' + nextPage);
                }

                return nextPage;
            },
            goToPage: function(page) {
                if (!page) {
                    if (this.backPage) {
                        page = this.backPage;
                    } else {
                        page = this.getNextPage(this.currentPage);
                    }
                }
                if (this.backPage) {
                    this.backPage = null;
                }

                $location.path('/'+page);
            }
        }
    }])
    .filter('time', function() {
        return function(input, skip) {
            var seconds, minutes, hours;
            seconds = Math.floor(input);

            if (seconds > 120) {
                minutes = Math.floor(seconds/60);

                seconds = seconds % 60;
                if (seconds < 10) {
                    seconds = '0' + seconds;
                }
            }
            if (minutes > 60) {
                hours = Math.floor(minutes/60);

                minutes = minutes % 60;
                if (minutes < 10) {
                    minutes = '0' + minutes;
                }
            }

            if (hours) {
                return hours + ':' + minutes + ':' + seconds;
            } else if (minutes) {
                return minutes + ':' + seconds;
            } else {
                if (skip) {
                    return seconds;
                }
                return seconds + 's';
            }
        }
    })
    .filter('timeAgo', function() {
        return function(timestamp) {
            var diff = ((new Date().getTime()) - (new Date(timestamp).getTime())) / 1000,
                day_diff = Math.floor(diff / 86400);

            return day_diff == 0 && (
                diff < 60 && "just now" ||
                    diff < 120 && "1 minute ago" ||
                    diff < 3600 && Math.floor( diff / 60 ) + " minutes ago" ||
                    diff < 7200 && "1 hour ago" ||
                    diff < 86400 && Math.floor( diff / 3600 ) + " hours ago") ||
                day_diff == 1 && "Yesterday" ||
                day_diff < 7 && day_diff + " days ago" ||
                day_diff < 31 && Math.ceil( day_diff / 7 ) + " weeks ago" ||
                "older than a month";
        }
    })
    .service('downloaderBackend', ['$http', '$q', 'xmlParser', '$rootScope', function($http, $q, xmlParser, $rootScope) {
        return {
            downloadFile: function(url) {
                var deferred = $q.defer();

                $http.get(url, {'responseType': 'blob'})
                    .success(function(file) {
                        deferred.resolve(file);
                    })
                    .error(function() {
                        deferred.reject();
                    })
                ;

                return deferred.promise;
            },
            downloadXml: function(url) {
                var deferred = $q.defer();

                $rootScope.$apply($http.get(url)
                    .success(function(xml) {
                        deferred.resolve(xmlParser.parse(xml));
                    })
                    .error(function(data, status, headers, config) {
                        deferred.reject();
                    })
                );

                return deferred.promise;
            }
        }
    }]);

angular.module('podcasts.downloader', ['podcasts.settings', 'podcasts.database', 'podcasts.utilities'])
    .service('downloader', ['db', 'url', '$http', 'settings', '$rootScope', function(db, url, $http, settings, $rootScope) {
        return {
            allowedToDownload: function(callback) {
                callback(true);

                /*
                 Not sure how to check this...
                 settings.get('downloadOnWifi', function(setting) {
                 if (setting.value) {
                 //TODO: check if we're on wifi
                 callback(false);
                 } else {
                 callback(true);
                 }
                 }, function() {
                 callback(true); // Default value is "allowed" - maybe change this?
                 });
                 */
            },
            downloadAll: function(silent) {
                var downloader = this;
                this.allowedToDownload(function(value) {
                    if (!value) {
                        console.log('Not Allowed to Download because not on Wifi');
                        if (!angular.isUndefined(silent) && !silent) {
                            alert('not Downloading because not on WiFi'); //TODO: nicer error message?
                        }
                    } else {
                        var itemsToDownload = [];
                        db.getCursor("feedItem", function(ixDbCursorReq)
                        {
                            if(typeof ixDbCursorReq !== "undefined") {
                                ixDbCursorReq.onsuccess = function (e) {
                                    var cursor = ixDbCursorReq.result || e.result;

                                    if (cursor) {
                                        if (!cursor.value.audio && cursor.value.audioUrl) {
                                            itemsToDownload.push(cursor.value);
                                        }
                                        cursor.continue();
                                    } else {
                                        downloader.downloadFiles(itemsToDownload);
                                    }
                                }
                            }
                        }, undefined, IDBKeyRange.only(1), undefined, 'ixQueued');
                    }
                });
            },
            downloadFiles: function(itemsToDownload) {
                var item = itemsToDownload.shift(),
                    downloader = this;
                if (!item) {
                    return;
                }

                console.log('downloading File for: ' + item.title);

                $rootScope.$apply(
                    $http.get(item.audioUrl, {'responseType': 'blob'})
                        .success(function(data) {
                            console.log('downloaded audio file for saving');

                            item.audio = data;
                            item.duration = downloader.getAudioLength(data);

                            db.put("feedItem", item);

                            downloader.downloadFiles(itemsToDownload);
                        })
                        .error(function() {
                            console.warn('Could not download file');
                        })
                );
            },
            getAudioLength: function(audio) {
                var tmpAudio = new Audio();
                tmpAudio.autoplay = false;
                tmpAudio.muted = true;
                tmpAudio.src = url.createObjectUrl(audio);

                return tmpAudio.duration;
            }
        };
    }]);

angular.module('podcasts.database', [])
    .run(function() {
        var dbConfig = (function () {
            //Create IndexedDB ObjectStore and Indexes via ixDbEz
            ixDbEz.createObjStore("feed", "id", true);
            ixDbEz.createIndex("feed", "ixUrl", "url", true);
            ixDbEz.createObjStore("feedItem", "id", true);
            ixDbEz.createIndex("feedItem", "ixGuid", "guid", true);
            ixDbEz.createIndex("feedItem", "ixFeedId", "feedId");
            ixDbEz.createIndex("feedItem", "ixQueued", "queued");
            ixDbEz.createObjStore("setting", "id", true);
            ixDbEz.createIndex("setting", "ixName", "name", true);
            ixDbEz.put("setting", {'name': "refreshInterval", 'value': 20000});
        });

        //Create or Open the local IndexedDB database via ixDbEz
        ixDbEz.startDB("podcastDb", 10, dbConfig, undefined, undefined, false);
    })
    .value('db', ixDbEz)
    .service('dbNew', ['$q', '$rootScope', 'db', function($q, $rootScope, _db) {
        var _getOne = function(store, identifier) {
            var deferred = $q.defer();

            _db.getCursor(store, function(ixDbCursorReq)
            {
                if(typeof ixDbCursorReq !== "undefined") {
                    ixDbCursorReq.onsuccess = function (e) {
                        var cursor = ixDbCursorReq.result || e.result;
                        if (cursor) {
                            $rootScope.$apply(deferred.resolve(cursor.value));

                            cursor.continue();
                        } else {
                            //TODO: not sure if this'll work, since it may both resolve and reject.
                            // May need to check if any were resolved or not first

                            // deferred.reject();
                        }
                    }
                } else {
                    deferred.reject();
                }
            }, null, IDBKeyRange.only(identifier));

            return deferred.promise;
        };

        return {
            getOne: _getOne
        };
    }]);


angular.module('podcasts.updater', ['podcasts.settings', 'podcasts.alarmManager', 'podcasts.downloader'])
    .run(['update', function(update) {
        //update.checkFeeds();
    }])
    .service('update', ['$log', 'downloader', 'updateFeedsAlarmManager', function($log, downloader, updateFeedsAlarmManager) {
        var checkFeeds = function() {
            $log.info('Running Feed Check');

            update();
            updateFeedsAlarmManager.setAlarm();
        };

        function update() {
            downloader.downloadAll(true);
        }

        return {
            checkFeeds: checkFeeds,
            update: update
        };
    }])
;

angular.module('podcasts.settings', ['podcasts.database'])
    .run(['settings', function(settings) {
        settings.init();
    }])
    .service('settings', ['db', function(db) {
        var settings = {},
            initialized = false,
            waiting = [];

        function _init() {
            db.getCursor("setting", function(ixDbCursorReq)
            {
                if(typeof ixDbCursorReq !== "undefined") {
                    ixDbCursorReq.onsuccess = function (e) {
                        var cursor = ixDbCursorReq.result || e.result;
                        if (cursor) {
                            settings[cursor.value.name] = cursor.value;

                            cursor.continue();
                        } else {
                            initialized = true;

                            for (var i = 0, l = waiting.length; i < l; i++) {
                                waiting[i]();
                            }
                        }
                    }
                }
            });
        }

        function _set(name, value, key) {
            var setting;

            if (key) {
                setting = {'id': key, 'name': name, 'value': value};
                if (settings[name]['id'] === key) {
                    settings[name] = setting;
                } else {
                    //TODO: name changed, go through all settings and find the setting by id, and adjust it
                }
            } else {
                setting = {'name': name, 'value': value};
                settings[name] = setting;
                //TODO: get id after inserting into DB
            }

            db.put("setting", setting);
        }

        function _get(name, onSuccess, onFailure) {
            if (!initialized) {
                waiting.push(function() {
                    _get(name, onSuccess, onFailure);
                });

                return;
            }

            if (!angular.isUndefined(settings[name])) {
                onSuccess(settings[name]);
            } else {
                db.getCursor("setting", function(ixDbCursorReq)
                {
                    if(typeof ixDbCursorReq !== "undefined") {
                        ixDbCursorReq.onsuccess = function (e) {
                            var cursor = ixDbCursorReq.result || e.result;
                            if (cursor) {
                                onSuccess(cursor.value);
                            } else {
                                if (typeof onFailure === 'function') {
                                    onFailure();
                                }
                            }
                        };

                        ixDbCursorReq.onerror = function (e) {
                            console.log('didnt get setting');
                            onFailure();
                        };
                    }
                }, function() { onFailure(); }, IDBKeyRange.only(name), undefined, 'ixName');
            }
        }

        function _setAllValuesInScope(scope) {
            if (angular.isObject(scope.settings.refreshInterval)) { // Took random setting here
                return;
            }

            if (!initialized) {
                waiting.push(function() {
                    _setAllValuesInScope(scope);
                });

                return;
            }

            angular.forEach(settings, function(setting, index) {
                scope.settings[setting.name] = setting;
            });

            scope.$apply(); //TODO: this conflicts with digest when getting to the settings page a second time
        }

        return {
            init: _init,
            set: _set,
            get: _get,
            setAllValuesInScope: _setAllValuesInScope
        };
    }])
;



angular.module('podcasts.importer', ['podcasts.utilities', 'podcasts.services'])
    .service('opml', ['xmlParser', 'feeds', function(xmlParser, feeds) {
        return {
            import: function(xml) {
                angular.forEach(xml.find('outline'), function(value, key) {
                    var element = angular.element(value);
                    if ("rss" != element.attr('type')) {
                        return;
                    }

                    var feedUrl = element.attr('xmlUrl');
                    if (feedUrl) {
                        feeds.add(feedUrl);
                    }
                });
            }
        }
    }])
    .service('google', ['$q', '$http', 'feeds', function($q, $http, feeds) {
        return {
            import: function(email, password) {
                var google = this;

                this.auth(email,
                        password)
                    .then(function(authId) {
                        return google.fetchSubscriptions(authId)
                    }, function() {
                        //TODO: display error
                    })
                    .then(function(subscriptions) {
                        google.addFeedsFromJsonResponse(subscriptions);
                    })
                ;
            },
            auth: function(email, password) {
                var escapedEmail = encodeURIComponent(email),
                    escapedPassword = encodeURIComponent(password),
                    deferred = $q.defer();

                $http.post(
                    'https://www.google.com/accounts/ClientLogin',
                    'Email=' + escapedEmail + '&Passwd=' + escapedPassword + '&service=reader',
                    {'headers': {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}}
                ).success(function(response) {
                    response.split(/\r\n|\r|\n/).forEach(function(value, index) {
                        var valueSplit = value.split('=');
                        if ('Auth' === valueSplit[0]) {
                            deferred.resolve(valueSplit[1]);
                        }
                    });
                }).error(function(data, status, headers, config) {
                    console.log(data, status, headers);
                    deferred.reject();
                });

                return deferred.promise;
            },
            fetchSubscriptions: function(authId) {
                var deferred = $q.defer();

                $http
                    .get(
                        'http://www.google.com/reader/api/0/subscription/list?output=json',
                        {'headers': {'Authorization': 'GoogleLogin auth=' + authId}}
                    )
                    .success(function(json) {
                        deferred.resolve(json);
                    })
                    .error(function(data, status, headers, config) {
                        deferred.reject();
                    })
                ;

                return deferred.promise;
            },
            addFeedsFromJsonResponse: function(json) {
                json.subscriptions.forEach(function(subscription, subscriptionIndex) {
                    if (subscription.categories.length <= 0) {
                        return false;
                    }

                    subscription.categories.forEach(function(category, categoryIndes) {
                        if ("Listen Subscriptions" === category.label) {
                            var feedUrl = subscription.id;
                            if ("feed/" === feedUrl.substring(0, 5)) {
                                feedUrl = feedUrl.substring(5);
                            }

                            feeds.add(feedUrl);
                        }
                    });
                });
            }
        };
    }])
;
angular.module('podcasts.router', [])
    .service('pageChanger', ['$location', function($location) {
        function goToFeed(feedId) {
            $location.path('/feed/' + feedId);
        }

        return {
            goToFeed: goToFeed
        };
    }])
;
