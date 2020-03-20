var InputWire = /** @class */ (function () {
    function InputWire(prop, mapper) {
        this.prop = prop;
        this.mapper = mapper;
    }
    Object.defineProperty(InputWire.prototype, "optional", {
        get: function () {
            return new InputWire(this.prop, this.mapper);
        },
        enumerable: true,
        configurable: true
    });
    InputWire.prototype.map = function (mapper) {
        var _this = this;
        return new InputWire(this.prop, function (value) { return mapper(_this.mapper(value)); });
    };
    return InputWire;
}());
var SinkSymbol = Symbol();
var SinkRef = /** @class */ (function () {
    function SinkRef() {
    }
    return SinkRef;
}());
fac.out('array');
var testInjectModule = createModule();
var testSystem = createSystem({
    constant: "asdf",
    date: new Date(),
    server: function (config) { return ({
        start: function () { return console.log(config); }
    }); },
    sink: createArraySink(),
    test: testInjectModule
});
var configuredSystem = testSystem.configure(function (wire) { return ({
    server: {
        config: {
            host: wire.in("constant"),
            port: 123,
            array: [wire.in("constant"), "123"],
            tuple: [wire.in('constant').map(function (s) { return s.toUpperCase(); }), wire.in("date"), wire.in("date").map(function (d) { return d.getTime(); })],
            nested: {
                config: wire.in("date")
            }
        }
    },
    test: {}
}); });
