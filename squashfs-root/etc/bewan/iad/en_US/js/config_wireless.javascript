var WirelessUtil = (function() {
    return {
        // from util.javascript
        numToHex: function(inNumeric) {
            if (inNumeric == 10) return "A";
            else if (inNumeric == 11) return "B";
            else if (inNumeric == 12) return "C";
            else if (inNumeric == 13) return "D";
            else if (inNumeric == 14) return "E";
            else if (inNumeric == 15) return "F";
            else return "" + inNumeric;
        },
        
        // from util.javascript
        hexa2Ascii: function(inHexa) {
            var inHexaLen = inHexa.length,
                tmpByte,
                outAscii = "",
                outAsciiLen;

            inHexa = inHexa.toUpperCase();
            if ((inHexaLen % 2) != 0) {
                throw ('The hexadecimal sequence is incomplete.');
            }
            for (var i = 0; i < inHexaLen; i++) {
                tmpByte = inHexa.charAt(i);
                if (((tmpByte < '0') || (tmpByte > '9')) && ((tmpByte < 'A') || (tmpByte > 'F'))) {
                    throw 'The hexadecimal sequence contains non-hex characters.';
                }
                if ((i % 2) == 0) outAscii += '%';
                outAscii += tmpByte;
            }
            outAscii = unescape(outAscii);
            outAsciiLen = outAscii.length;

            if (outAsciiLen != Math.floor(inHexaLen / 2)) {
                throw 'The hexadecimal sequence contains non-printing characters.';
            }
            for (i = 0; i < outAsciiLen; i++) {
                tmpByte = outAscii.charCodeAt(i);
                if ((tmpByte < 32) || (tmpByte > 127)) {
                    throw 'The hexadecimal sequence contains non-printing characters.';
                }
            }
            return outAscii;
        },

        // from util.javascript
        ascii2Hexa: function(inAscii) {
            var outHexa = '';
            var inAsciiLen = inAscii.length;
            var ascii;
            var highByte;
            var lowByte;

            for (var i = 0; i < inAsciiLen; i++) {
                ascii = inAscii.charCodeAt(i) % 256;
                highByte = Math.floor(ascii / 16);
                lowByte = ascii % 16;
                outHexa += this.numToHex(highByte) + this.numToHex(lowByte);
            }
            return outHexa;
        },
    
        // from util.javascript
        isAscii: function(Str,inCouldBeEmpty,inLength) {
            if (!Str) return inCouldBeEmpty;
            if (Str.length != inLength) return false;
            Str = Str.toUpperCase();
            return (/^[\w !~#\$%&'"\(\)\*+,\-\.\/\:;<=>\?@\[\]\\\^`\{\}\|]+$/).test(Str);
        },
        
        isHexadecimal: function(Str, inCouldBeEmpty, inLength) {
            if(!Str) {return inCouldBeEmpty;}
            if (Str.length != inLength) return false;
            Str = Str.toUpperCase();
            var regExp = new RegExp("^[0-9A-F]{" + inLength + "}$");
            return regExp.test(Str);
        }
        
    };
})();

var Page = (function($, App) {
    var data, util = $.util,
    vRules,
    token,
    cli,
    validator,
        
    Messages = App.MessageUtil,
    // ui elements
    primarySettingsUi,
    uiWifiInterfaces,
        
    // binders
    //primarySettingsBinder,
    wlanBasConfigBinder,
    wlanAdvConfigBinder,
        
    // changes to the ui are recorded here
    updatesBas = {},
    updatesAdv = {},
    
    allMACFilters = {},
    
    wpaKey,
    wepKey,
    cfg_reloaded = 0,
    currWlanId = 1;
    
    // Check WPS PIN code, pop up an alert if wrong WPS PIN code and focus on WPS PIN code field
    function checkWPSPINCode(pin_code) {
        var checksum = 0;
        var res;
        checksum += 3 * (Math.floor(pin_code / 10000000) % 10);
        checksum += 1 * (Math.floor(pin_code / 1000000) % 10);
        checksum += 3 * (Math.floor(pin_code / 100000) % 10);
        checksum += 1 * (Math.floor(pin_code / 10000) % 10);
        checksum += 3 * (Math.floor(pin_code / 1000) % 10);
        checksum += 1 * (Math.floor(pin_code / 100) % 10);
        checksum += 3 * (Math.floor(pin_code / 10) % 10);
        checksum += 1 * (Math.floor(pin_code / 1) % 10);
        res = (0 == (checksum % 10));
        return res;
    }

    vRules = {
        "WLANInterface_1_Config_SSID": [
            {
                type: "required",
                message: 'Please provide a network name (SSID).'
            },
            {
                type: "pattern",
                pattern: /^[0-9A-Za-z%\(\?>@\)\^~"_=\+'&\.\]/\\| \*<!#\$\-\[\{\}:;,`]+$/,
                message: 'Network name must be alpha numeric.'
            }
        ],
        
        "wirelessPassword": {
            type: function(val, opts) {
                var pass = util.trim(val), sec = $("#WLANInterface_1_Config_BeaconType").val(), passLen = pass.length;
                // password is blank, not changin the password.
                if(!pass && sec != 'BasicNone') {
                    opts.message = 'Please provide a password';
                    return false;
                }
                
                // check for spaces
                if(pass.indexOf('\\s') != -1) {
                    opts.message = 'Password cannot contain white spaces.';
                }
                
                // check for 
                if(sec === "WPA" || sec === "WPA2" || sec === "WPA-Auto") {
                    if(! WirelessUtil.isHexadecimal(pass, false, 64)) {
                        if(passLen < 8 || passLen > 63 || !WirelessUtil.isAscii(pass, false, passLen)) {
                            opts.message = 'Password must be 64 hex digits or 8 to 63 ASCII characters';
                            return false;
                        }
                    }
                }
                
                // check for WEP
                if(sec === "Basic") {
                    if(! WirelessUtil.isHexadecimal(pass, false, 10) && !WirelessUtil.isHexadecimal(pass, false, 26)) {
                        if(pass.length !== 5 && pass.length !== 13) {
                            opts.message = 'Password must be 10 or 26 hex or 5 or 13 ASCII characters.';
                            return false;
                        }
                    }
                }
                return true;
            },
            message: 'Please provide a valid password.'
        }
    };    
    validator = $.validator({rules: vRules, renderer: App.ValidationMessageRenderer()});

    filteringRules = {
        filtering_Hostname: [
            {type: "required", message: 'Please provide a Hostname (alpha-numeric).'},
            {type: "pattern", pattern: /^[0-9A-Za-z_-]+$/, message: 'Network name must be alpha numeric.'}
        ],
        filtering_MACAddress: [
            {type: "required", message: 'Please provide a MAC Address.'},
            {
                type: "pattern", 
                pattern: /^[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}$/, 
                message: 'Please provide a valid MAC Address.'
            }
        ]
    };
    filteringValidator = $.validator({rules: filteringRules, renderer: App.ValidationMessageRenderer()});
    
    function handleWpsModeChange(val) {
        var pinCodeUi = $("#pinNumber"), pushButtonUi = $("#wpsPushButton");
        
        validator.clear();
        
        if(val === "PIN") {
            pinCodeUi.removeClass("none");
            pushButtonUi.addClass("none");
        }else {
            pushButtonUi.removeClass("none");
            pinCodeUi.addClass("none");
        }
    }
    
    function handleWpsEnabled(bVal,update) {
        var wpsSettingsUi = $("#wpsSettings1");
        var pinCodeUi = $("#pinNumber");
        var wps = "WLANInterface_1_WPSEnable";
        var wpsmethod = "WLANInterface_1_WPSMethod";
        var beacontype = $('#WLANInterface_1_Config_BeaconType').val();
        $("#WLANInterface_1_WPSEnable").attr("state", bVal);
        if(bVal == 1 && beacontype != "Basic" && beacontype != "WPA" && $('#WLANInterface_1_Config_HideSSID').attr('state') == "1") {
            if ( update == 1 ) {
                updatesBas[wps] = "1";
                updatesBas[wpsmethod] = $("#WLANInterface_1_WPSMethod").val() == "PIN" ? "PIN" : "PBC";
            }
            wpsSettingsUi.removeClass("none");
            handleWpsModeChange($("#WLANInterface_1_WPSMethod").val());
        }else {
            if ( update == 1 ) {
                updatesBas[wps] = "0";
                delete updatesBas[wpsmethod];
            }
            wpsSettingsUi.addClass("none");
            pinCodeUi.addClass("none");
        }
    }

    function handleWmmEnabled(bVal) {
        var wmmpsSettingsUi = $("#WMMPSSettings");
        if(bVal == 1) {
            wmmpsSettingsUi.removeClass("none");
        }else {
            wmmpsSettingsUi.addClass("none");
            $("#WLANInterface_1_WMMPSEnable").attr("value", bVal);
            $("#WLANInterface_1_WMMPSEnable").setStyle({'backgroundPosition': '-34px'});
        }
    }

    function handleMacFiltering(bVal) {
        var macFSettingsUi = $("#MACFilteringSettings");
        var macFTableUi = $("#MACFilteringTable");

        if(bVal == 1) {
            macFSettingsUi.removeClass("none");
            macFTableUi.removeClass("none");
        }else {
            macFSettingsUi.addClass("none");
            macFTableUi.addClass("none");
        }
    }
    
    function writeWpsConfig(callback) {
        var method = $("#WLANInterface_1_WPSMethod").val();
        
        validator.clear();
        if(method === "PIN" && !validator.validate(["WLANInterface_1_Config_WPSPINCode"])) {
            return;
        }

        cli.rollback();
        cli.write("WLANInterface_" + currWlanId + "_WPSEnable", 1);
        cli.write("WLANInterface_" + currWlanId + "_WPSMethod", method);
        cli.commit(function(res) {
            if(res.error) {
                Messages.error(res.error);
            }else {
                if(callback) {
                    callback();
                }
            }
        });
    }
    
    function connectPin() {
        Messages.clearAll();
        var pin = util.trim($("#WLANInterface_1_Config_WPSPINCode").val());
        var method = $("#WLANInterface_1_WPSMethod").val();
        pin = pin.replace(/([0-9]{4})-([0-9]{4})/g, "$1$2");
        pin = pin.replace(/([0-9]{4}) ([0-9]{4})/g, "$1$2");
        var pin_already_used = pin != "" && data.WLANInterface["1"]["Config"]["WPSPINCode"] == pin;
        if (((pin.length == 4) || (pin.length == 8 && checkWPSPINCode(pin))) && !pin_already_used) {
            cli.rollback();
            cli.write("WLANInterface_" + currWlanId + "_WPSMethod", method);
            cli.write("WLANInterface_" + currWlanId + "_Config_WPSPINCode", pin);
            cli.commit();
        } else {
            Messages.error((!pin_already_used) ? 'Please provide a valid PIN' : 'PIN already used in last PIN session.<br/>Please provide a valid PIN');
        }
    }

    function connectPushButton() {
        Messages.clearAll();
        cli.rollback();
        cli.fct("wifi_wps_push", "");
        cli.commit();
    }
    
    function handleWirelessSecurityChange(field, changeKey) {
        var beaconKey = "WLANInterface_" + 1 + "_Config_BeaconType", 
        wepEnc = "WLANInterface_" + 1 + "_Config_WEPEncryption",
        wpaEnc = "WLANInterface_" + 1 + "_Config_WPAEncryption",

        beaconType = field.value;
        if (beaconType === "Basic" || beaconType === "WPA") {
            var prev_beacon = data.WLANInterface["1"]["Config"]["BeaconType"];
            if (Object.keys(updatesBas).length != 0) {
                var key;
                for(key in updatesBas) {
                    if (key == beaconKey) {
                        prev_beacon = updatesBas[key];
                        break;
                    }
                }
            }
            if ($("#WLANInterface_1_WPSEnable").attr("state") == 1) {
                if (! confirm('This will also disable wps feature, do you want to continue ?')) {
                    $("#WLANInterface_1_Config_BeaconType").val(prev_beacon);
                    return;
                } else {
                    morpheus($("#WLANInterface_1_WPSEnable").elements[0], { duration:300, backgroundPosition: '-34px'});
                    handleWpsEnabled(0,1);
                }
            }
        }
        // unset any values previously set in the update data.
        delete updatesBas[beaconKey];
        delete updatesBas[wepEnc];
        delete updatesBas[wpaEnc];
        
        var passwd=''
        if (beaconType == 'BasicNone') {
            $('#wirelessPassword').attr("disabled","true");
            $('#wirelessPassword').val('');
        } else {
            $('#wirelessPassword').removeAttr("disabled");
            if (beaconType == 'Basic') {
                if (data.WLANInterface["1"]["Config"]["WEPKeyAscii1"] == '1') {
                    if (changeKey) $("#wirelessPassword").val(WirelessUtil.hexa2Ascii(wepKeyOrig));
                } else {
                    if (changeKey) $("#wirelessPassword").val(wepKeyOrig);
                }
            } else {
                if (changeKey) $("#wirelessPassword").val(wpaKeyOrig);
            }
            passwd = util.trim($("#wirelessPassword").val());
        }
            
        if(beaconType === "BasicNone" || beaconType === "Basic") {
            // For 'Basic' and 'BasicNone' the beacon is always 'Basic'
            updatesBas[beaconKey] = "Basic";
            updatesBas[wepEnc] = (beaconType === "BasicNone") ? "None" : "WEP-AUTO";
        }else {
            updatesBas[beaconKey] = beaconType;
            updatesBas[wpaEnc] = "Auto";
        }

        if (changeKey) configureWirelessPassword(beaconType, passwd);
    }
    
    function configureWirelessPassword(beacon, passwd) {
        var asciiBit = 0, 
            encPass,
            wepKeyProp = "WLANInterface_" + currWlanId + "_Config_WEPKey1", 
            wepAsciiProp = "WLANInterface_" + currWlanId + "_Config_WEPKeyAscii1",
            wpaDefKeyProp = "WLANInterface_" + currWlanId + "_Config_WPADefaultKey";
            
        // unset any values previously set in the update data.
        resetWirelessPassword();
        
        // security is none, Ignore password
        if(beacon === "BasicNone" || !passwd) {
            return;
        }
        
        if(beacon === "Basic") { // WEP
            encPass = "";
            if(WirelessUtil.isAscii(passwd, false, 5) || WirelessUtil.isAscii(passwd, false, 13) ) {
                encPass = ConfigAccess.encrypt(data.token,WirelessUtil.ascii2Hexa(passwd));
                asciiBit = 1;
            }
            
            if( WirelessUtil.isHexadecimal(passwd, false, 10) || WirelessUtil.isHexadecimal(passwd, false, 26)) {
                encPass = ConfigAccess.encrypt(data.token,passwd);
                asciiBit = 0;
            }

            if(encPass != "") {
                updatesBas[wepKeyProp] = encPass;
                wepKey = passwd;
            }
            updatesBas[wepAsciiProp] = asciiBit;
        }else { // WPA variants
            encPass = ConfigAccess.encrypt(data.token, passwd);
            if(encPass != "") {
                updatesBas[wpaDefKeyProp] = encPass;
                wpaKey = passwd;
            }
        }
        
        // console.log(JSON.stringify(updates, null, " "));
    }
    
    function checkBoxFormatter(val, ctx) {
        var fld = ctx.field.get(0);
        if(ctx.operation === "read") {
            return fld.checked ? 1 : 0;
        }else {
            fld.checked = (val == "1");
            return null;
        }
    }
    
    function switchFormatter(val, ctx) {
        var fld = ctx.field;
        if(ctx.operation === "read") {
            return fld.attr("state");
        }else {
            fld.attr("state", val);
            if (val == "0" ) {
                fld.setStyle({'backgroundPosition': '-34px'});
            } else {
                fld.setStyle({'backgroundPosition': '0px'});
            }
            return null;
        }
    }

    function switchSSIDBrdFormatter(val, ctx) {
        var fld = ctx.field;
        if(ctx.operation === "read") {
            var res = fld.attr("state");
            if (res == "1") return 0;
            else return 1;  
        }else {
            var broadcastssid = val == 1 ? 0 : 1;
            fld.attr("state", broadcastssid);
            if (broadcastssid == "0" ) {
                fld.setStyle({'backgroundPosition': '-34px'});
            } else {
                fld.setStyle({'backgroundPosition': '0px'});
            }
            return null;
        }
    }

    function ssidFormatter(val, ctx) {
        var fld = ctx.field;
        return (ctx.operation === "read") ? ctx.field.attr("value") : val;
    }    

    function setupBinders() {
        wlanBasConfigBinder = App.DataBinder({
            fields: [
                "WLANConfig_Enable",
                "WLANInterface_1_Config_HideSSID",
                "WLANInterface_1_Config_SSID",
                "WLANInterface_1_Config_BeaconType",
                "WLANInterface_1_WPSEnable",
                "WLANInterface_1_WPSMethod",
            ],
            formatters: {
                "WLANInterface_1_Config_SSID":ssidFormatter,
                "WLANConfig_Enable": switchFormatter,
                "WLANInterface_1_Config_HideSSID": switchSSIDBrdFormatter,
                "WLANInterface_1_Config_BeaconType": function(val, ctx) {
                    var isWrite = ctx.operation === "write", 
                    wlanid = 1;//ctx.indices.wlanid, 
                    data = ctx.data, 
                    wlanIfConfig = data.WLANInterface[""+ wlanid].Config;

                    if(isWrite) {
                        if (cfg_reloaded == 0) {
                            wepKey = wepKeyOrig = data.WLANInterface["1"]["Config"]["WEPKey1"];
                            wpaKey = wpaKeyOrig = data.WLANInterface["1"]["Config"]["WPADefaultKey"];                            
                        }
                        if (val === "Basic" && wlanIfConfig.WEPEncryption === "None") {
                            $('#wirelessPassword').attr("disabled","true");
                            $('#wirelessPassword').val('');
                            return "BasicNone";
                        } else {
                            $('#wirelessPassword').removeAttr("disabled");
                            if (val === "Basic") {
                                if (data.WLANInterface["1"]["Config"]["WEPKeyAscii1"] == '1') {
                                    $("#wirelessPassword").val(WirelessUtil.hexa2Ascii(wepKeyOrig));
                                } else {
                                    $("#wirelessPassword").val(wepKeyOrig);
                                }
                                return "Basic";
                            } else {
                                $("#wirelessPassword").val(wpaKeyOrig);
                                return val;
                            }
                        }
                    }
                    return null;
                },
                "WLANInterface_1_WPSEnable": function(val, ctx) {
                    var fld = ctx.field;
                    if(ctx.operation === "read") {
                        return fld.attr("state");
                    }else {
                        val = val == "1" ? 1 : 0;
                        fld.attr("state", val);
                        if (val == "0" ) {
                            fld.setStyle({'backgroundPosition': '-34px'});
                        } else {
                            fld.setStyle({'backgroundPosition': '0px'});
                        }
                        handleWpsEnabled(val,0);
                        return null;
                    }
                }
            }, 
            onfieldchange: function(field, binder) {
                if(field.className != "switchButton") {
                     var fId = field.id;
                     if(fId === "WLANInterface_1_Config_BeaconType") {
                         handleWirelessSecurityChange(field, true);
                     }else {
                         binder.serialize({
                             target: updatesBas,
                             indices: {
                                 wlanid: currWlanId
                             }
                         }, fId);
                     }
                }
            }
        });

        wlanAdvConfigBinder = App.DataBinder({
            fields: [
                "WLANConfig_Standard",
                "WLANConfig_Channel",
                "WLANConfig_Bandwidth",
                "WLANConfig_TxPower",
                "WLANInterface_1_WMMEnable",
                "WLANInterface_1_WMMPSEnable",
                "WLANInterface_1_MACAddress",
                "WLANInterface_1_ACLEnable",
            ],
            formatters: {
                "WLANInterface_1_WMMPSEnable": switchFormatter,
                "WLANInterface_1_WMMEnable": function(val, ctx) {
                    var fld = ctx.field;
                    if(ctx.operation === "read") {
                        return fld.attr("state");
                    }else {
                        fld.attr("state", val);
                        if (val == "0" ) {
                            fld.setStyle({'backgroundPosition': '-34px'});
                        }else {
                            fld.setStyle({'backgroundPosition': '0px'});
                        }
                        
                        handleWmmEnabled(val);
                        return null;
                    }
                },
                "WLANInterface_1_ACLEnable": function(val, ctx) {
                    var fld = ctx.field;
                    if(ctx.operation === "read") {
                        return fld.attr("state");
                    }else {
                        val = val == "1" ? 1 : 0;
                        fld.attr("state", val);
                        if (val == "0" ) {
                            fld.setStyle({'backgroundPosition': '-34px'});
                        }else {
                            fld.setStyle({'backgroundPosition': '0px'});
                        }
                        
                        handleMacFiltering(val);
                        return null;
                    }
                }
            }, 
            onfieldchange: function(field, binder) {
                if(field.className != "switchButton") {
                    var fId = field.id;
                    binder.serialize({
                        target: updatesAdv,
                        indices: {
                            wlanid: currWlanId
                        }
                    }, fId);
                }
            }
        });
    }

    function refreshConfiguration() {
        cli.rollback();
        cli.read("WLANConfig");
        if ( data.AccessClass == 4 ) cli.read("LANDevice_1_AccessControl");
        cli.read("WLANInterface");
        var ret = cli.commitSync();
        if(ret.error) {
            Messages.error('Error getting wireless data. Please refresh the page.');
        } else {
            data.WLANConfig = ret["WLANConfig"];
            if ( data.AccessClass == 4 ) data.AccessControl = ret["LANDevice_1_AccessControl"];
            data.WLANInterface = ret["WLANInterface"];
            cfg_reloaded = 1;
        }
    }
    
    function populateBasForm() {
        $("#WLANInterface_1_Config_BeaconType").html('');
        var standard = data.WLANConfig.Standard;
        if( standard == "11n" || standard == "11gn" || standard == "11bgn" || standard == "Auto" ) {
            $("#WLANInterface_1_Config_BeaconType").append(['<option value="WPA-Auto">WPA/WPA2</option>',
                                                            '<option value="WPA2">WPA2</option>',
                                                            '<option value="BasicNone">None (Not Recommended)</option>']);
        }
        else {
            $("#WLANInterface_1_Config_BeaconType").append(['<option value="WPA-Auto">WPA/WPA2</option>',
                                                          '<option value="WPA2">WPA2</option>',
                                                          '<option value="WPA">WPA</option>',
                                                          '<option value="Basic">WEP</option>',
                                                          '<option value="BasicNone">None (Not Recommended)</option>']); 
        }
        wlanBasConfigBinder.write({
            data: data
        });
    }

    function populateAdvForm() {
        wlanAdvConfigBinder.write({
            data: data
        });
    }

    function hasModifications(updateData) {
        var has = false, key;
        for(key in updateData) {
            has = true;
            break;
        }
        return has;
    }
    
    function initWifiInterfaceListUi() {
        var wlans = data.WLANInterface, wlanCount = Number(wlans.Count), wlanList = [], i;
        
        for(i = 1; i <= wlanCount; i++) {
            var theWlan = wlans[i + ""];
            wlanList[wlanList.length] = {
                wlanid: i,
                name: theWlan.Description || theWlan.Name
            };
        }
    }
    
    function addMacFiltering(hostname,macaddress) {
        var index = 1;
        var lastindex=0;
        var ACLs =data.AccessControl;
        var aclList = ACLs.List.split(',');
        aclList.sort();
        for (var i in allMACFilters) {
            if (allMACFilters[i] == macaddress) {
                return 0;
            }
        }
        for (var i in allMACFilters) {
            if (parseInt(i) - parseInt(lastindex) > 1) {
                index = parseInt(lastindex) +1;
                break;
            }
            index = parseInt(i)+1;
            var existing = true;
            for (var j in allMACFilters) {
                if ( j == index){
                    existing = false;
                    break;
                }
            }
            if (existing) break;
            lastindex = i;
        }
        cli.rollback();
        cli.write("LANDevice_1_AccessControl_"+index+"_ClientName",hostname);
        cli.write("LANDevice_1_AccessControl_"+index+"_MACAddress",macaddress);
        cli.write("LANDevice_1_AccessControl_"+index+"_Enable",1);
        cli.commit(function(res) {
            if(!res.error) {
                allMACFilters[index] = macaddress;
            }
        });

        return index;
    }

    function displayMACFiltering(){
        allMACFilters = {};
        var uifilteringTable= $("#MACFilteringTableBody");
        var ACLs =data.AccessControl;
        var aclList = ACLs.List.split(',');
        aclList.sort();
        var tableBody='';

        if (ACLs.List != '') {
            for (var i in aclList) {
                allMACFilters[aclList[i]] = ACLs[aclList[i]]["MACAddress"];
                if (ACLs[aclList[i]]["Enable"] == 1) {
                    var mac = ACLs[aclList[i]]["MACAddress"];
                    tableBody +='<tr id="MACRow'+aclList[i]+'"><td>'+ACLs[aclList[i]]["ClientName"]+'</td><td>'+mac+'</td><td class="actions"><img width="16px" onclick="Page.remove(\''+mac+'\');" alt="Delete" src="../../img/delete.png"></td></tr>';
                }
            }
        }
        uifilteringTable.html(tableBody);
    }

    function removeMACFiltering(mac){
        Messages.clearAll();
        var index;
        var ACLs =data.AccessControl;
        var aclList = ACLs.List.split(',');
        for (var i in allMACFilters) {
            if (allMACFilters[i] == mac) {
                index= i;
                break;
            }
        }
        
        cli.rollback();
        cli.remove(["LANDevice_1_AccessControl", index].join("_"));
        cli.commit(function(res) {
            if(!res.error) {
                Messages.info('MAC Filtering entry successfully removed.');
                
            }
        });
        $("#MACRow"+index).addClass("none");
    }

    function populateMACFiltering() {
        var uifilteringMACAddresss = $("#filtering_MACAddress"), uifilteringHostname = $("#filtering_Hostname"), uifilteringTable= $("#MACFilteringTableBody");
        
        displayMACFiltering();

        $("#cancelFiltering").bind("click", function() {
            filteringValidator.clear();
            Messages.clearAll();
            uifilteringHostname.val('');
            uifilteringMACAddresss.val('');
        });

        $("#addFiltering").bind("click", function() {
            var datas;
            filteringValidator.clear();
            Messages.clearAll();
            if(filteringValidator.validate()) {
                datas = {
                    MACAddress: util.trim(uifilteringMACAddresss.val()),
                    Hostname: util.trim(uifilteringHostname.val()),
                    User: 1
                };
                var index;
                if (index = addMacFiltering(datas["Hostname"],datas["MACAddress"]) > 0) {
                    Messages.info('MAC Filtering entry successfully added.');
                    var mac = uifilteringMACAddresss.val();
                    uifilteringTable.append('<tr id="MACRow'+index+'"><td>'+uifilteringHostname.val()+'</td><td>'+mac+'</td><td class="actions"><img width="16px" onclick="Page.remove(\''+mac+'\');" alt="Delete" src="../../img/delete.png"></td></tr>');
                    uifilteringHostname.val('');
                    uifilteringMACAddresss.val('');
                } else {
                    Messages.error('This MAC Address already exists.');
                }
            }
        });
    }

    function resetWirelessPassword() {
        var wepKeyProp = "WLANInterface_1_Config_WEPKey1";
        var wepAsciiProp = "WLANInterface_1_Config_WEPKeyAscii1";
        var wpaDefKeyProp = "WLANInterface_1_Config_WPADefaultKey";
        delete updatesBas[wepKeyProp];
        delete updatesBas[wepAsciiProp];
        delete updatesBas[wpaDefKeyProp];
        wepKey = wepKeyOrig;
        wpaKey = wpaKeyOrig;
    }
    
    function cleanupUpdates() {
        var key;
        if (Object.keys(updatesBas).length != 0) {
            var wlen = "WLANConfig_Enable";
            var hidessid = "WLANInterface_1_Config_HideSSID";
            var beacon = "WLANInterface_1_Config_BeaconType";
            var wps = "WLANInterface_1_WPSEnable";
            var wpsmethod = "WLANInterface_1_WPSMethod";
            var wepEnc = "WLANInterface_1_Config_WEPEncryption";
            var wpaEnc = "WLANInterface_1_Config_WPAEncryption";
            var wepKeyProp = "WLANInterface_1_Config_WEPKey1";
            var wepAsciiProp = "WLANInterface_1_Config_WEPKeyAscii1";
            var wpaDefKeyProp = "WLANInterface_1_Config_WPADefaultKey";

            for(key in updatesBas) {
                if (key == wlen && data.WLANConfig.Enable == updatesBas[key]) delete updatesBas[key];
                if (key == hidessid && data.WLANInterface["1"]["Config"]["HideSSID"] == updatesBas[key]) delete updatesBas[key];
                if (key == beacon && data.WLANInterface["1"]["Config"]["BeaconType"] == updatesBas[key]) delete updatesBas[key];
                if (key == wps && data.WLANInterface["1"]["WPSEnable"] == updatesBas[key]) delete updatesBas[key];
                if (key == wpsmethod && data.WLANInterface["1"]["WPSMethod"] == updatesBas[key]) delete updatesBas[key];
                if (key == wepEnc && data.WLANInterface["1"]["Config"]["WEPEncryption"] == updatesBas[key]) delete updatesBas[key];
                if (key == wpaEnc && data.WLANInterface["1"]["Config"]["WPAEncryption"] == updatesBas[key]) delete updatesBas[key];
                if (key == wepKeyProp) {
                    if (updatesBas[wepAsciiProp] == 1) {
                        if (ConfigAccess.encrypt(data.token,WirelessUtil.ascii2Hexa(wepKeyOrig)) == updatesBas[key]) delete updatesBas[key];
                        else wepKeyOrig = wepKey;
                    } else {
                        if (ConfigAccess.encrypt(data.token,wepKeyOrig) == updatesBas[key]) delete updatesBas[key];
                        else wepKeyOrig = wepKey;
                    }
                    if (data.WLANInterface["1"]["Config"]["WEPKeyAscii1"] == updatesBas[wepAsciiProp]) delete updatesBas[wepAsciiProp];
                }
                if (key == wpaDefKeyProp) {
                    if (ConfigAccess.encrypt(data.token,wpaKeyOrig) == updatesBas[key]) delete updatesBas[key];
                    else wpaKeyOrig = wpaKey;
                }
            }
        }
        if (Object.keys(updatesAdv).length != 0) {
            var standard = "WLANConfig_Standard";
            var channel = "WLANConfig_Channel";
            var bw = "WLANConfig_Bandwidth";
            var txpwr = "WLANConfig_TxPower";
            var wmm = "WLANInterface_1_WMMEnable";
            var wppps = "WLANInterface_1_WMMPSEnable";
            var acl = "WLANInterface_1_ACLEnable";

            for(key in updatesAdv) {
                if (key == standard && data.WLANConfig.Standard == updatesAdv[key]) delete updatesAdv[key];
                if (key == channel && data.WLANConfig.Channel == updatesAdv[key]) delete updatesAdv[key];
                if (key == bw && data.WLANConfig.Bandwidth == updatesAdv[key]) delete updatesAdv[key];
                if (key == txpwr && data.WLANConfig.TxPower == updatesAdv[key]) delete updatesAdv[key];
                if (key == wmm && data.WLANInterface["1"]["WMMEnable"] == updatesAdv[key]) delete updatesAdv[key];
                if (key == wppps && data.WLANInterface["1"]["WMMPSEnable"] == updatesAdv[key]) delete updatesAdv[key];
                if (key == acl && data.WLANInterface["1"]["ACLEnable"] == updatesAdv[key]) delete updatesAdv[key];
            }
        }
    }
    
    function setupUi() {
            
        if(data.wirelessNMode == 1) {
            $("#WLANConfig_Standard")
            .append([
                '<option value="11n">802.11n</option>',
                '<option value="11gn">802.11g+n</option>',
                '<option value="11bgn">802.11b+g+n</option>'
             ].join(""));
        }

        initWifiInterfaceListUi();
        
        $(".switchButton").bind("click", function() {
            var id = $("#"+this.id);
            if (this.id == "WLANInterface_1_Config_HideSSID") {
                if ( id.attr("state") == 1 && $("#WLANInterface_1_WPSEnable").attr("state") == 1) {
                    if (! confirm('This will also disable wps feature, do you want to continue ?')) { 
                        return;
                    } else {
                        morpheus($("#WLANInterface_1_WPSEnable").elements[0], { duration:300, backgroundPosition: '-34px'});
                        handleWpsEnabled(0,1);
                    }
                }
            }

            if (this.id == "WLANInterface_1_WPSEnable") {
                if ( id.attr("state") == 0) {
                    var beaconField = document.getElementById('WLANInterface_1_Config_BeaconType');
                    var beaconValue = beaconField.value;
                    if ( beaconValue == "Basic" || beaconValue == "WPA" ) {
                        Messages.error('Cannot enable wps feature in security mode WEP or WPA.');
                        return;
                    }
                    if ($("#WLANInterface_1_Config_HideSSID").attr("state") == 0) {
                        if (! confirm('This will also enable ssid broadcast feature, do you want to continue ?')) { 
                            return;
                        } else {
                            morpheus($("#WLANInterface_1_Config_HideSSID").elements[0], { duration:300, backgroundPosition: '0px'});
                            $("#WLANInterface_1_Config_HideSSID").attr("state", 1);
                            var hidessid = "WLANInterface_" + 1 + "_Config_HideSSID";
                            updatesBas[hidessid] = 0;
                        }
                    }
                }
            }

            if (this.id == "WLANInterface_1_WMMEnable") {
                if (id.attr("state") == 1) {
                    if ($("#WLANConfig_Standard").val() == "11n") {
                        Messages.error('Cannot disable WMM feature in Operation Mode 802.11n.');
                        return;
                    } else if ($("#WLANConfig_Standard").val() == "11bgn" || $("#WLANConfig_Standard").val() == "Auto") {
                        if (! confirm('Disabling WMM feature in Operation Mode 802.11bgn is not recommended, do you want to continue ?')) { 
                            return;
                        }
                    }
                }
            }

            if (id.attr("state") == 0 ) {
                morpheus(id.elements[0], { duration:300, backgroundPosition: '0px'});
                id.attr("state", 1);
            } else {
                morpheus(id.elements[0], { duration:300, backgroundPosition: '-34px'});
                id.attr("state", 0);
            }
            if(this.id == "WLANInterface_1_WPSEnable") {
                var id = $("#"+this.id);
                handleWpsEnabled(id.attr("state"),1);
            }
            else if(this.id == "WLANInterface_1_WMMEnable") {
                var id = $("#"+this.id);
                handleWmmEnabled(id.attr("state"));
            }
            else if(this.id == "WLANInterface_1_ACLEnable") {
                var id = $("#"+this.id);
                handleMacFiltering(id.attr("state"));
            }


            var cur_tab_idx = $("#menu-configWifi li a.active").attr("rel");
            if ( cur_tab_idx == "01" ) {
                wlanBasConfigBinder.serialize({
                    target: updatesBas,
                    indices: {
                        wlanid: currWlanId
                    }
                }, this.id);
            }
            if ( cur_tab_idx == "02" ) {
                wlanAdvConfigBinder.serialize({
                    target: updatesAdv,
                    indices: {
                        wlanid: currWlanId
                    }
                }, this.id);
            }

        });

        $("#wirelessSecurity").bind("change", function() {
            handleWirlessSecurityChange(this.value, currWlanId);
        });
        
        $("#WLANInterface_1_WPSMethod").bind("change", function() {
            handleWpsModeChange(this.value);
        });
        
        util.forEach($("#WLANInterface_1_WPSMethod option").elements, function (opts) {
            if (opts.value == data.WLANInterface["1"].WPSMethod) {
                opts.selected=true;
            }
         });

        $("#wpsPushButton").bind("click", function() {
            connectPushButton();
        });
        
        $("#wpsPinConnect").bind("click", function() {
            connectPin();
        });
        
        $("#wirelessPassword").bind("change", function() {
            configureWirelessPassword($("#WLANInterface_1_Config_BeaconType").val(), util.trim(this.value));
        });
        
        $("#WLANConfig_Standard").bind("change", function() {
            var beaconField = document.getElementById('WLANInterface_1_Config_BeaconType');
            var beaconValue = beaconField.value;
            var prev_standard = data.WLANConfig.Standard;
            if (Object.keys(updatesAdv).length != 0) {
                var key;
                for(key in updatesAdv) {
                    if (key == "WLANConfig_Standard") {
                        prev_standard = updatesAdv[key];
                        break;
                    }
                }
            }
            var standard = $("#WLANConfig_Standard").val();
            var changeKey = false;
            if( standard == "11n" || standard == "11gn" || standard == "11bgn" || standard == "Auto" ) {
                if ( beaconValue == "WPA" || beaconValue == "Basic") {
                    if (! confirm('This will also change wireless security mode in basic configuration, do you want to continue ?')) {
                        $("#WLANConfig_Standard").val(prev_standard);
                        return;
                    }
                }
            }
            $("#WLANInterface_1_Config_BeaconType").html('');
            if( standard == "11n" || standard == "11gn" || standard == "11bgn" || standard == "Auto" ) {
                $("#WLANInterface_1_Config_BeaconType").append([
                                                               '<option value="WPA-Auto">WPA/WPA2</option>',
                                                               '<option value="WPA2">WPA2</option>',
                                                               '<option value="BasicNone">None (Not Recommended)</option>']);
               if ( beaconValue != "WPA" && beaconValue != "Basic") {
                   $("#WLANInterface_1_Config_BeaconType").val(beaconValue);
               } else {
                   $("#WLANInterface_1_Config_BeaconType").val("WPA2");
                   changeKey = true;
               }
            }
            else {
                $("#WLANInterface_1_Config_BeaconType").append([
                                                              '<option value="WPA-Auto">WPA/WPA2</option>',
                                                              '<option value="WPA2">WPA2</option>',
                                                              '<option value="WPA">WPA</option>',
                                                              '<option value="Basic">WEP</option>',
                                                              '<option value="BasicNone">None (Not Recommended)</option>']);
               $("#WLANInterface_1_Config_BeaconType").val(beaconValue);
            }

            handleWirelessSecurityChange(beaconField,changeKey);
        });
        
        $("#saveBas").bind("click", function() {
            Messages.clearAll();
            if(validator.validate()) { // only validate SSID and password
                var updates = 0;
                cli.rollback();
                cleanupUpdates();
                if (Object.keys(updatesBas).length != 0) {
                    updates = 1;
                    cli.write(updatesBas);
                }
                if (Object.keys(updatesAdv).length != 0) {
                    updates = 1;
                    cli.write(updatesAdv);
                }
                if ( updates == 1 ) {
                    cli.commit(function(res) {
                        if(cli.error) {
                            Messages.error(res.error);
                        }else {
                            updatesBas = {};
                            updatesAdv = {};
                            Messages.info('Wireless basic configuration successfully saved.');
                        }
                        refreshConfiguration();
                        populateBasForm();
                        populateAdvForm();
                    });
                }
            }
        });
        
        $("#saveAdv").bind("click", function() {
            var updates = 0;
            Messages.clearAll();
            cli.rollback();
            cleanupUpdates();
            if (Object.keys(updatesBas).length != 0) {
                updates = 1;
                cli.write(updatesBas);
            }
            if (Object.keys(updatesAdv).length != 0) {
                updates = 1;
                cli.write(updatesAdv);
            }
            if ( updates == 1 ) {
                cli.commit(function(res) {
                    if(cli.error) {
                        Messages.error(res.error);
                    }else {
                        updatesBas = {};
                        updatesAdv = {};
                        Messages.info('Wireless advanced configuration successfully saved.');
                    }
                    refreshConfiguration();
                    populateBasForm();
                    populateAdvForm();
                });
            }
        });
        
        $("#cancelBas").bind("click", function() {
            Messages.clearAll();
            resetWirelessPassword();
            cleanupUpdates();
            if (Object.keys(updatesAdv).length != 0) {
                if (! confirm('Advanced Wifi configuration changes will be lost also, do you want to continue ?')) {
                    return;
                }
            }
            updatesBas = {};
            updatesAdv = {};
            populateBasForm();
            populateAdvForm();
        });
        $("#cancelAdv").bind("click", function() {
            Messages.clearAll();
            resetWirelessPassword();
            cleanupUpdates();
            if (Object.keys(updatesBas).length != 0) {
                if (! confirm('Basic Wifi configuration changes will be lost also, do you want to continue ?')) {
                    return;
                }
            }
            updatesBas = {};
            updatesAdv = {};
            populateBasForm();
            populateAdvForm();
        });

    }

    function initUI() {
        setupUi();
        setupBinders();
        populateBasForm();
        populateAdvForm();
        populateMACFiltering();
    }

    function switchWifiConfigCheck(cur_tab_idx, next_tab_idx) {
        var ret = true;
        if ( cur_tab_idx !=  next_tab_idx ) {
            Messages.clearAll();
            if ( cur_tab_idx == "01" ) {
                if(!validator.validate()) { // only validate SSID and password
                    Messages.error('Wireless basic configuration not valid, please fix or cancel changes before switching tabs.');
                    ret = false;
                }
            }
        }
        return ret;
    }

    return {
        init: function(pageData) {
            data = pageData;
            token = data.token;
            cli = ConfigAccess(token);
            initUI();
        },
        remove: function(mac){
            removeMACFiltering(mac);
        },
        switchWifiConfigCheck: switchWifiConfigCheck,
    };
})(lite, App);
