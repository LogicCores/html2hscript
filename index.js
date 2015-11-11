// code pulled from https://www.npmjs.com/package/html2hyperscript
var Parser = require('htmlparser2').Parser;
var camel = require('to-camel-case');
var isEmpty = require('is-empty');
var thisIsSVGTag = require('./lib/svg-namespaces').thisIsSVGTag,
    getSVGNamespace = require('./lib/svg-namespaces').getSVGNamespace,
    getSVGAttributeNamespace = require('./lib/svg-namespaces').getSVGAttributeNamespace;

var elementStack = [];

function ItemList(parent) {
    this.parent = parent;
    this.content = '';
    this.spacer = '';
    this.indent = parent ? parent.indent : '';
    this.isFirstItem = true;
}

ItemList.prototype.addSpace = function (space) {
    this.spacer += space;

    if (space.indexOf("\n") !== -1) {
        // reset indent when there are new lines
        this.indent = /[^\n]*$/.exec(space)[0];
    } else {
        // otherwise keep appending to current indent
        this.indent += space;
    }
}

ItemList.prototype.add = function (data, ignoreComma) {
    if (!ignoreComma) {
        if (!this.isFirstItem) {
            this.content += this.spacer.length ? ',' : ', ';
        }

        this.isFirstItem = false;
    }

    this.content += this.spacer;
    this.spacer = '';

    this.content += data;
}

module.exports = function(html, options, cb) {
    if (typeof options === "function" && typeof cb === "undefined") {
        cb = options;
        options = null;
    }
    options = options || {};
    options.controlAttributes = options.controlAttributes || {};
    var currentItemList = new ItemList(null);

    var inlineScripts = [];
    var components = {};

    var parser = new Parser({
        onopentag: function (name, attribs) {
            currentItemList = new ItemList(currentItemList);
            elementStack.unshift([ name, attribs, {
                sectionViews: {}
            } ]);
        },
        ontext: function (text) {
            currentItemList.add(JSON.stringify(text));
            /*var lines = text.split("\n");

             var isFirst = true;

             lines.forEach(function (line) {
             var lineMatch = /^(\s*)(.*?)(\s*)$/.exec(line);

             var preSpace = lineMatch[1],
             mainText = lineMatch[2],
             postSpace = lineMatch[3];

             if (!isFirst) {
             currentItemList.addSpace("\n");
             }

             currentItemList.addSpace(preSpace);

             if (mainText.length > 0) {
             currentItemList.add(JSON.stringify(mainText));
             }

             isFirst = false;
             });*/
        },
        onclosetag: function (tagname) {
            var element = elementStack.shift();
            var elementContent = currentItemList.content + currentItemList.spacer;

            currentItemList = currentItemList.parent;

            var indent = currentItemList.indent;

            var attribs = element[1];

            var id = attribs['id'];

            var idSuffix = id !== undefined ? '#' + id : '';
            delete attribs['id'];

            var classNames = attribs['class'];
            var classSuffix = (classNames !== undefined ? classNames : '').split(/\s+/g).filter(function (v) { return v.length > 0; }).map(function (cls) { return '.' + cls; }).join('');
            delete attribs['class'];
            // Convert inline CSS style attribute to an object
            if(attribs['style']){
                var rules = attribs["style"].split(";");
                attribs["style"] = {};
                rules.forEach(function(rule){
                    var split = rule.split(":");
                    if(split.length >= 2){
                        attribs["style"][split.shift().trim()] = split.join(":").trim();
                    }
                });
            }

            var style = attribs['style']
            delete attribs['style']

            var dataset = {};
            var datasetKey;
            Object.keys(attribs).forEach(function (k) {
                if (k.slice(0, 5) === 'data-') {
                    datasetKey = camel(k.slice(5));
                    dataset[datasetKey] = attribs[k];
                    delete attribs[k];
                }
            });

            var attrPairs = Object.keys( attribs ).map( function ( k ) {
                return JSON.stringify( k ) + ': ' + JSON.stringify( attribs[ k ] )
            } );
            var datasetPairs = Object.keys( dataset ).map( function ( k ) {
                return JSON.stringify( k ) + ': ' + JSON.stringify( dataset[ k ] )
            } );

            var objects = {}
            if ( !isEmpty( style ) ) objects.style = style
            if ( !isEmpty( attribs ) ) objects.attributes = attribs
            if ( !isEmpty( dataset ) ) objects.dataset = dataset
            if ( thisIsSVGTag( element[ 0 ] ) ) {
                objects.namespace = getSVGNamespace();

                Object.keys(attribs).forEach(function (k) {
                    var namespace = getSVGAttributeNamespace(k);

                    if (namespace === void 0) { // not a svg attribute
                        return;
                    }

                    var value = objects.attributes[ k ];

                    if (typeof value !== 'string' &&
                        typeof value !== 'number' &&
                        typeof value !== 'boolean'
                    ) {
                        return;
                    }

                    if (namespace !== null) { // namespaced attribute
                        objects[ k ] = 'SVGAttributeHook(\'' + namespace + '\',\'' + value + '\')';
                    }
                });
            }

            var itemPrefix = "";
            var itemSuffix = "";

            var objectStr = "";
            var conditionalControlObject = {};
            if (!isEmpty(objects)) {

                function getAttribute (name, keep) {
                    name = options.controlAttributes.prefix + name;
                    var propName = null;
                    var value = null;
                    if (
                        /^data-/.test(options.controlAttributes.prefix) &&
                        objects.dataset &&
                        typeof (
                            value = objects.dataset[
                                (propName = camel(name.replace(/^data-/, "")))
                            ]
                        ) !== "undefined"
                    ) {
                        if (options.controlAttributes.remove && !keep) {
                            delete objects.dataset[propName];
                        }
                        return value;
                    } else
                    if (objects.attributes) {
                        if (typeof objects.attributes[name] === "undefined") {
                            return null;
                        }
                        var value = objects.attributes[name];
                        if (options.controlAttributes.remove && !keep) {
                            delete objects.attributes[name];
                        }
                        return value;
                    }
                    return null;
                }
                var attribute = getAttribute("id");
                if (attribute !== null) {
                    conditionalControlObject.id = attribute;
                }
                attribute = getAttribute("section");
                if (attribute !== null) {
                    conditionalControlObject.section = attribute;
                }
                attribute = getAttribute("view");
                if (attribute !== null) {
                    conditionalControlObject.view = attribute;
                }
                attribute = getAttribute("location");
                if (attribute !== null) {
                    conditionalControlObject.location = attribute;
                }
                attribute = getAttribute("impl");
                if (attribute !== null) {
                    conditionalControlObject.impl = attribute;
                }
                attribute = getAttribute("prop", true);
                if (attribute !== null) {
                    conditionalControlObject.property = attribute;
                }

                attribute = getAttribute("prop-target");
                if (attribute !== null && conditionalControlObject.property) {
                    conditionalControlObject.propertyTarget = attribute;
                    var targetParts = attribute.split("/");
				    if (!objects.attributes) {
				        objects.attributes = {};
				    }
    				if (targetParts.length === 1) {
    				    objects.attributes[targetParts[0]] = "{{" + conditionalControlObject.property + "}}";
    				} else
    				if (targetParts.length === 2 && targetParts[0] === "style") {
    				    if (!objects.style) {
    				        objects.style = {};
    				    }
    					if (targetParts[1] === "background-image") {
    						objects.style[targetParts[1]] = "url('{{" + conditionalControlObject.property + "}}')";
    					} else {
    						objects.style[targetParts[1]] = "{{'" + conditionalControlObject.property + "}}";
    					}
    				} else {
    					throw new Error("Unsupported target '" + attribute + "'");
    				}
                }

                if (element[0] === "script") {
                    var script = {};
                    if (typeof conditionalControlObject.id !== "undefined") {
                        script.id = conditionalControlObject.id;
                    }
                    if (typeof conditionalControlObject.location !== "undefined") {
                        script.location = conditionalControlObject.location;
                    }
                    if (
                        options.controlAttributes.scriptLocations &&
                        options.controlAttributes.scriptLocations[script.location] !== true
                    ) {
                        return;
                    }
                    script.code = JSON.parse('[' + elementContent + ']').join("");
                    inlineScripts.push(script);
                    return;
                }

                objectStr = JSON.stringify(objects);
            }

            var item = null;



            // See if we have a parent tag that just has a section attribute (no view).
            if (
                elementStack[0] &&
                (elementStack[0][1]["component:section"] || elementStack[0][1]["data-component-section"]) &&
                (!elementStack[0][1]["component:view"] && !elementStack[0][1]["data-component-view"])
            ) {
                if (
                    // See if we have a child tag that does not specify a section attribute so we ignore it.
                    !conditionalControlObject.section ||
                    // See if we have a child tag that specifies a view that is already declared.
                    elementStack[0][2].sectionViews[conditionalControlObject.view]
                ) {
                    return;
                }
                elementStack[0][2].sectionViews[conditionalControlObject.view] = true;
            }



            if (Object.keys(conditionalControlObject).length > 0) {
                if (
//                    typeof conditionalControlObject.section !== "undefined" &&
                    typeof conditionalControlObject.view !== "undefined"
                ) {
                    item = 'ch(' + JSON.stringify(conditionalControlObject) + ', function () { return ' + 
                        'h(' + JSON.stringify(element[0] + idSuffix + classSuffix) + (
                            (objectStr !== "") ? ", " + objectStr : ""
                        ) + 
                        (
                            elementContent.length ? 
                            ', [' + (elementContent[0] === "\n" ? '' : ' ') + elementContent + (elementContent.match(/\s$/) ? '' : ' ') + ']'
                                : ''
                        ) +
                        ')' +
                        '; })';
                } else {
                    item = 'h(' + JSON.stringify(element[0] + idSuffix + classSuffix) + (
                            (objectStr !== "") ? ", " + objectStr : ""
                        ) + 
                        ', ch(' + JSON.stringify(conditionalControlObject) + ', function () { return ' + 
                        (
                            elementContent.length ? 
                            '[' + (elementContent[0] === "\n" ? '' : ' ') + elementContent + (elementContent.match(/\s$/) ? '' : ' ') + ']'
                                : ''
                        ) +
                        '; })' +
                        ')';
                }

            } else {
                item = 'h(' + JSON.stringify(element[0] + idSuffix + classSuffix) + (
                        (objectStr !== "") ? ", " + objectStr : ""
                    )
                        //     attrPairs.length || datasetPairs.length
                        //         ? ", { \"attributes\": { "
                        //         : ''
                        // ) + (
                        //     attrPairs.length
                        //         ? attrPairs.join(",\n" + indent + '    ')
                        //         : ''
                        // ) + (
                        //     datasetPairs.length && attrPairs.length
                        //         ? ",\n" + indent + '    '
                        //         : ''
                        // ) + (
                        //     datasetPairs.length
                        //         ? "\"dataset\": { " + datasetPairs.join(",\n" + indent + '    ') + "}"
                        //         : ''
                        // ) + (
                        //     attrPairs.length || datasetPairs.length
                        //         ? "}}"
                        //         : ''
                        // )
    
                    + (
                        elementContent.length
                            ? ', [' + (elementContent[0] === "\n" ? '' : ' ') + elementContent + (elementContent.match(/\s$/) ? '' : ' ') + ']'
                            : ''
                    ) + ')';
            }

            if (typeof conditionalControlObject.id !== "undefined") {
                if (components[conditionalControlObject.id]) {
                    return cb(new Error("Component with id '" + conditionalControlObject.id + "' is declared multiple times! Each component must have a unique id."));
                }
                components[conditionalControlObject.id] = {
                    impl: conditionalControlObject.impl || null,
                    chscript: item
                };
                var anchorItem = 'ch(' + JSON.stringify({
                    anchor: conditionalControlObject.id
                }) + ', function () { return h("div", ' + JSON.stringify({
                    dataset: {
                        componentId: conditionalControlObject.id,
                        componentImpl: conditionalControlObject.impl || null,
                        componentAnchorId: conditionalControlObject.id
                    }
                }) + ');})';
                currentItemList.add(anchorItem);
            } else {
                currentItemList.add(item);
            }
        },
        oncomment: function (text) {
            currentItemList.add('/*' + text + '*/', false); // @todo comment-safety
        },
        onend: function () {
            cb(null, currentItemList.content, components, inlineScripts);
        }
    }, {decodeEntities: true});

    parser.write(html);
    parser.end();
}