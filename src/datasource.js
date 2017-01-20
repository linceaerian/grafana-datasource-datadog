import _ from 'lodash';

export class DataDogDatasource {

  constructor (instanceSettings, $q, backendSrv, templateSrv) {
    this.type = instanceSettings.type;
    this.url = instanceSettings.url;
    this.name = instanceSettings.name;
    this.api_key = instanceSettings.jsonData.api_key;
    this.application_key = instanceSettings.jsonData.app_key;
    this.supportMetrics = true;
    this.q = $q;
    this.backendSrv = backendSrv;
    this.templateSrv = templateSrv;
    this._cached_metrics = false;
  }

  // Function to check Datasource health
  testDatasource() {
    return this.invokeDataDogApiRequest('/downtime')
    .then(() => {
      return {
        status: "success",
        title: "Success",
        message: "Data source is working"
      };
    })
    .catch(error => {
      var message = "Connection error";
      if (error && error.message) {
        message = error.message;
      }

      return {
        status: "error",
        title: "Error",
        message: message
      };
    });
  }

  metricFindTags() {
    if (this._cached_tags && this._cached_tags.length) {
      return Promise.resolve(this._cached_tags);
    }

    if (this.fetching_tags) {
      return this.fetching_tags;
    }

    this.fetching_tags = this.invokeDataDogApiRequest('/tags/hosts')
    .then(result => {
      this._cached_tags = _.map(result.tags, (hosts, tag) => {
        return {
          text: tag,
          value: tag,
        };
      });

      return this._cached_tags;
    });

    return this.fetching_tags;
  }

  metricFindQuery() {
    if (this._cached_metrics) {
      return Promise.resolve(this._cached_metrics);
    }

    if (this.fetching) {
      return this.fetching;
    }

    var d = new Date();
    d.setDate(d.getDate() - 1);
    var from = Math.floor(d.getTime() / 1000);
    var params = { from: from };

    this.fetching = this.invokeDataDogApiRequest('/metrics', params)
    .then(result => {
      this._cached_metrics = _.map(result.metrics, metric => {
        return {
          text: metric,
          value: metric,
        };
      });

      return this._cached_metrics;
    });

    return this.fetching;
  }

  query(options) {
    var from = Math.floor(options.range.from.valueOf() / 1000);
    var to = Math.floor(options.range.to.valueOf() / 1000);

    var targets = options.targets.filter(function (t) { return !t.hide; });

    if (targets.length <= 0) {
      return this.q.when({data: []});
    }
    var queries = _.map(options.targets, function (val) {
      return val.query;
    });
    var queryString = queries.join(',');
    var params = {
      from: from,
      to: to,
      query: queryString,
    };

    return this.invokeDataDogApiRequest('/query', params)
    .then(result => {
      var dataResponse = _.map(result.series, (series, i) => {
        var target = targets[i];
        return {
          'target': target.alias || series.expression,
          'datapoints': _.map(series.pointlist, point => {
            return [point[1], point[0]];
          })
        };
      });

      return {data: dataResponse};
    });
  }

  annotationQuery(options) {
    console.log(options);
    let timeFrom = Math.floor(options.range.from.valueOf() / 1000);
    let timeTo = Math.floor(options.range.to.valueOf() / 1000);
    return this.getEventStream(timeFrom, timeTo)
    .then(events => {
      console.log(events);
      return events.map(event => {
        return {
          annotation: options.annotation,
          time: event.date_happened * 1000,
          title: event.title,
          text: event.text
        };
      });
    });
  }

  getEventStream(timeFrom, timeTo) {
    let params = {
      start: timeFrom,
      end: timeTo
    };

    return this.invokeDataDogApiRequest('/events', params)
    .then(result => {
      if (result.events) {
        return result.events;
      } else {
        return [];
      }
    });
  }

  invokeDataDogApiRequest(url, params = {}) {
    // Set auth params
    params.api_key = this.api_key;
    params.application_key = this.application_key;

    return this.backendSrv.datasourceRequest({
      method: 'GET',
      url: this.url + url,
      params: params
    })
    .then(response => {
      if (response.data) {
        return response.data;
      } else {
        throw {message: 'DataDog API request error'};
      }
    })
    .catch(error => {
      var message = 'DataDog API request error';
      if (error.statusText) {
        message = error.status + ' ' + error.statusText;
        throw {message: message};
      } else if (error.err.statusText) {
        throw {message: error.err.statusText};
      } else {
        throw {message: message};
      }
    });
  }
}
