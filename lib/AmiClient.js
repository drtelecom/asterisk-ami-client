/**
 * Developer: BelirafoN
 * Date: 27.04.2016
 * Time: 15:37
 */

"use strict";

const EventEmitter = require('events').EventEmitter;
const amiConnector = require('asterisk-ami-connector');
const debugLog = require('debug')('AmiClient');
const debugError = require('debug')('AmiClient:error');

/**
 * AmiClient class
 */
class AmiClient extends EventEmitter{

    /**
     * Constructor
     */
    constructor(options){
        super();

        Object.assign(this, {
            _connectorFactory: amiConnector,
            _kaTimer: null,
            _kaActionId: null,
            _options: Object.assign({
                reconnect: false,
                maxAttemptsCount: 30,
                attemptsDelay: 1000,
                keepAlive: false,
                keepAliveDelay: 5000,
                emitEventsByTypes: true,
                eventTypeToLowerCase: false,
                addTime: false,
                eventFilter: null
            }, options),
            _connection: null,
            _lastAction: null
        });

        this._prepareOptions();
    }

    /**
     *
     * @param user
     * @param secret
     * @param options
     * @returns {Promise}
     */
    connect(user, secret, options){
        let connector = this._connectorFactory({
            reconnect: this._options.reconnect,
            maxAttemptsCount: this._options.maxAttemptsCount,
            attemptsDelay: this._options.attemptsDelay
        });

        return connector.connect(user, secret, options)
            .then(amiConnection => {
                this._connection = amiConnection;
                this.emit('connect', this._connection);

                this._connection
                    .on('event', event => {
                        if(!this._eventIsAllow(event)){ return; }
                        if(this._options.addTime){
                            event.$time = Date.now();
                        }

                        this.emit('event', event);

                        if(this._options.emitEventsByTypes && event.Event){
                            let eventName = this._options.eventTypeToLowerCase ?
                                event.Event.toLowerCase() : event.Event;
                            this.emit(eventName, event);
                        }
                    })
                    .on('response', response => {
                        if(this._options.keepAlive && response.ActionID === this._kaActionId){
                            debugLog('keep-alive heart bit');
                            this._keepAliveBit();
                            return;
                        }
                        if(this._options.addTime){
                            response.$time = Date.now();
                        }
                        this.emit('response', response);
                    })
                    .on('data', chunk => this.emit('data', chunk))
                    .on('error', error => this.emit('error', error))
                    .on('close', () => {
                        clearTimeout(this._kaTimer);
                        this.emit('disconnect');
                    });

                if(this._options.keepAlive){
                    this._keepAliveBit();
                }
                return this._connection;
            })
    }

    /**
     *
     */
    disconnect(){
        clearTimeout(this._kaTimer);
        this._connection.close();
        return this;
    }

    /**
     *
     * @param message
     */
    action(message){
        this._lastAction = message;
        this.emit('action', message);
        this._connection.write(message);
        return this;
    }

    /**
     *
     * @param message
     */
    write(message){
        return this.action(message);
    }

    /**
     *
     * @param name
     * @param value
     * @returns {*}
     */
    option(name, value){
        if(!Object.hasOwnProperty.call(this._options, name)){
            return value === undefined ? undefined : false;
        }
        if(value !== undefined){
            this._options[name] = value;
            return true;
        }
        return this._options[name];
    }

    /**
     *
     * @param newOptions
     * @returns {*}
     */
    options(newOptions){
        if(newOptions === undefined){
            return this._options;
        }

        Object.keys(this._options).forEach(optionName => {
            if(Object.hasOwnProperty.call(newOptions, optionName)){
                this._options[optionName] = newOptions[optionName];
            }
        }, this);
        return this._prepareOptions();
    }

    /**
     * Keep-alive heart bit handler
     * @private
     */
    _keepAliveBit(){
        this._kaTimer = setTimeout(() => {
            if(this._options.keepAlive && this._connection && this.isConnected){
                this._kaActionId = `--spec_${Date.now()}--`;
                this._connection.write({
                    Action: 'Ping',
                    ActionID: this._kaActionId
                });
            }
        }, this._options.keepAliveDelay);
        this._kaTimer.unref();
        return this;
    }

    /**
     *
     * @returns {AmiClient}
     * @private
     */
    _prepareOptions(){
        if(this._options.eventFilter && !(this._options.eventFilter instanceof Set)){
            if(Array.isArray(this._options.eventFilter)){
                this._options.eventFilter = new Set(this._options.eventFilter);
            }else{
                this._options.eventFilter = new Set(Object.keys(this._options.eventFilter));
            }
        }
        return this;
    }

    /**
     *
     * @param event
     * @private
     */
    _eventIsAllow(event){
        let eventName = event.Event ? event.Event.toLowerCase() : null;

        if(eventName && this._options.eventFilter){
            return !this._options.eventFilter.has(eventName);
        }
        return true;
    }

    /**
     *
     * @returns {null}
     */
    get lastEvent(){
        return this._connection ? this._connection.lastEvent : null;
    }

    /**
     *
     * @returns {null}
     */
    get lastResponse(){
        return  this._connection ? this._connection.lastResponse : null;
    }

    /**
     *
     * @returns {boolean}
     */
    get isConnected(){
        return  this._connection ? this._connection.isConnected : null;
    }

    /**
     *
     * @returns {null}
     */
    get lastAction(){
        return this._lastAction;
    }

    /**
     *
     * @returns {T|*}
     */
    get connection(){
        return this._connection;
    }
}

module.exports = AmiClient;