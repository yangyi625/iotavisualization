import React from 'react';
import PropTypes from 'prop-types';
import Tangle from '../components/Tangle';
import {connect} from 'react-redux';
import * as d3Force from 'd3-force';
import {scaleLinear, scaleLog} from 'd3-scale';
import {generateTangle} from '../shared/generateData';
import Slider from 'rc-slider';
import Tooltip from 'rc-tooltip';
import 'rc-slider/assets/index.css';
import 'rc-tooltip/assets/bootstrap.css';
import {getAncestors, getDirectApprovers, getDescendants, getTips} from '../shared/algorithms';
import './radio-button.css';
import {uniformRandom, unWeightedMCMC, weightedMCMC} from '../shared/tip-selection';
import '../components/Tangle.css';

const mapStateToProps = (state, ownProps) => ({});
const mapDispatchToProps = (dispatch, ownProps) => ({});

const delay = ms => new Promise(r => {
  setTimeout(r, ms);
});

const delayByAnimationSpeed = (animationSpeed, factor=1) =>
  delay(factor * getDelayFactor(animationSpeed));

const getDelayFactor = animationSpeed => {
  const scale = scaleLog()
    .domain([0.01, 1])
    .range([maxDelayInMs, minDelayInMs]);

  return scale(Math.max(0.01, animationSpeed));
};

const defaultAnimationSpeed = 0.7;
const maxDelayInMs = 5 * 1000;
const minDelayInMs = 5;

const nodeRadiusMax = 25;
const nodeRadiusMin = 13;
const showLabelsMinimumRadius = 21;
const getNodeRadius = nodeCount => {
  const smallNodeCount = 20;
  const largeNodeCount = 100;

  if (nodeCount < smallNodeCount) {
    return nodeRadiusMax;
  }
  if (nodeCount > largeNodeCount) {
    return nodeRadiusMin;
  }
  const scale = scaleLinear().domain([smallNodeCount, largeNodeCount]);
  scale.range([nodeRadiusMax, nodeRadiusMin]);

  return scale(nodeCount);
};

const tipSelectionDictionary = {
  'UR': {
    algo: uniformRandom,
    label: 'Uniform Random',
  },
  'UWRW': {
    algo: unWeightedMCMC,
    label: 'Unweighted Random Walk',
  },
  'WRW': {
    algo: weightedMCMC,
    label: 'Weighted Random Walk',
  },
};

const leftMargin = 10;
const rightMargin = 10;
const bottomMargin = 190;

const nodeCountMin = 1;
const nodeCountMax = 500;
const nodeCountDefault = 50;
const lambdaMin = 0.1;
const lambdaMax = 50;
const lambdaDefault = 2;
const alphaMin = 0;
const alphaMax = 5;
const alphaDefault = 0.5;

const Handle = Slider.Handle;
const sliderHandle = props => {
  const {value, dragging, index, ...restProps} = props;
  return (
    <Tooltip
      prefixCls="rc-slider-tooltip"
      overlay={value}
      visible={dragging}
      placement="top"
      key={index}
    >
      <Handle value={value} {...restProps} />
    </Tooltip>
  );
};

sliderHandle.propTypes = {
  value: PropTypes.number.isRequired,
  dragging: PropTypes.bool.isRequired,
  index: PropTypes.number.isRequired,
};

const TipAlgorithmLabel = ({selectedAlgorithm, onChange, algoKey}) =>
  <label className='container' key={algoKey}>
    <div style={{fontSize: 10}}>
      {tipSelectionDictionary[algoKey].label}
    </div>
    <input type='radio' name='radio' value={algoKey}
      checked={selectedAlgorithm === algoKey}
      onChange={onChange}
    />
    <span className='checkmark'></span>
  </label>;

TipAlgorithmLabel.propTypes = {
  selectedAlgorithm: PropTypes.string.isRequired,
  onChange: PropTypes.any,
  algoKey: PropTypes.string.isRequired,
};

const SliderContainer = props =>
  <div style={{display: 'table', width: '100%'}}>
    <div className='left-slider-value'>
      {props.min}
    </div>
    <div style={{
      display: 'table-cell',
      position: 'relative',
      top: '5px',
    }}>
      <Slider
        min={props.min}
        max={props.max}
        defaultValue={props.defaultValue}
        step={props.step}
        marks={{}}
        handle={props.handle}
        disabled={props.disabled}
        onChange={props.onChange}
        trackStyle={{visibility: 'hidden'}}
        railStyle={{
          borderRadius: 0,
          height: '1.2px',
          backgroundColor: 'black',
        }}
        handleStyle={{
          borderWidth: 0,
          backgroundColor: 'black',
          width: '10px',
          height: '10px',
          marginTop: '-4.5px',
        }}
      />
    </div>
    <div className='right-slider-value'>
      {props.max}
    </div>
  </div>;

SliderContainer.propTypes = {
  min: PropTypes.number.isRequired,
  max: PropTypes.number.isRequired,
  defaultValue: PropTypes.number.isRequired,
  step: PropTypes.number,
  handle: PropTypes.any,
  disabled: PropTypes.bool,
  onChange: PropTypes.any,
};

class TangleContainer extends React.Component {
  constructor(props) {
    super();

    this.state = {
      nodes: [],
      links: [],
      nodeCount: nodeCountDefault,
      lambda: lambdaDefault,
      alpha: alphaDefault,
      width: 300, // default values
      height: 300,
      tipSelectionAlgorithm: 'UWRW',
      tangleId: 0,
      animationSpeed: defaultAnimationSpeed,
      oneByOne: true,
      path: [],
    };
    this.updateWindowDimensions = this.updateWindowDimensions.bind(this);

    this.force = d3Force.forceSimulation();
    this.force.alphaDecay(0.1);

    this.force.on('tick', () => {
      this.force.nodes(this.state.nodes);

      // restrict nodes to window area
      for (let node of this.state.nodes) {
        node.y = Math.max(this.nodeRadius(), Math.min(this.state.height - this.nodeRadius(), node.y));
      }

      this.recalculateFixedPositions();

      this.setState({
        links: this.state.links,
        nodes: this.state.nodes,
      });
    });
  }
  nodeRadius() {
    return getNodeRadius(this.state.nodes ? this.state.nodes.length : 1);
  }
  componentWillUnmount() {
    this.force.stop();
    window.removeEventListener('resize', this.updateWindowDimensions);
  }
  componentDidMount() {
    this.startNewTangle();
    this.updateWindowDimensions();
    window.addEventListener('resize', this.updateWindowDimensions);
  }
  updateWindowDimensions() {
    this.setState({
      width: window.innerWidth - leftMargin - rightMargin,
      height: window.innerWidth < 768 ? window.innerHeight : window.innerHeight - bottomMargin,
    }, () => {
      this.recalculateFixedPositions();
      this.force
        .force('no_collision', d3Force.forceCollide().radius(this.nodeRadius() * 2).strength(0.01).iterations(15))
        .force('pin_y_to_center', d3Force.forceY().y(d => this.state.height / 2).strength(0.1))
        .force('pin_x_to_time', d3Force.forceX().x(d => this.xFromTime(d.time)).strength(1))
        .force('link', d3Force.forceLink().links(this.state.links).strength(0.5).distance(this.nodeRadius() * 3)); // strength in [0,1]

      this.force.restart().alpha(1);
    });
  }
  animateWalk({node, tangle, tangleId}) {
    const walk = path =>
      path.reduce((promises, particle, index) =>
        promises
          .then(() => {
            if (this.state.tangleId !== tangleId) {
              return Promise.resolve();
            }

            let newLink = null;

            if (particle === path[path.length - 1]) {
              // Last node in path. Add link if it's not already in the list
              newLink = tangle.links.find(link =>
                link.source === node &&
                link.target === particle);

              if (this.state.links.includes(newLink)) {
                newLink = null;
              }
            }

            return new Promise((resolve, reject) => {
              this.setState({
                walker: particle,
                links: newLink ? [...this.state.links, newLink] : this.state.links,
                path: path.slice(0, index+1),
              }, resolve);
            });
        }).then(() => this.state.oneByOne && delayByAnimationSpeed(this.state.animationSpeed)),
        Promise.resolve());

    return node.paths.reduce((promise, path) =>
        promise.then(() => this.state.oneByOne && walk(path)), Promise.resolve())
      .then(() => {
        return new Promise(resolve => {
          this.setState({
            walker: null,
          }, resolve);
        });
      });
  }
  startNewTangle() {
    const tangle = generateTangle({
      nodeCount: this.state.nodeCount,
      lambda: this.state.lambda,
      alpha: this.state.alpha,
      nodeRadius: this.nodeRadius(),
      tipSelectionAlgorithm: tipSelectionDictionary[this.state.tipSelectionAlgorithm].algo,
    });

    const tangleId = this.state.tangleId + 1;
    this.setState({tangleId});

    const {width, height} = this.state;

    for (let node of tangle.nodes) {
      node.y = height/4 + Math.random()*(height/2),
      node.x = width/2; // required to avoid annoying errors
    }

    this.force.stop();

    if (this.state.oneByOne) {
      const update = nodeCount => new Promise(resolve => {
        if (tangleId !== this.state.tangleId) {
          return;
        }

        this.setState({
          nodes: tangle.nodes.slice(0, nodeCount),
          links: tangle.links.filter(link => link.source && parseInt(link.source.name) < nodeCount-1),
        }, () => {
          this.force.restart().alpha(0.2);
          resolve(
            this.animateWalk({
              node: tangle.nodes[nodeCount-1],
              tangle,
              tangleId,
            }));
        });
      });

      [...Array(tangle.nodes.length).keys()].reduce((promises, nodeCount) =>
        promises.then(() => update(nodeCount+1)),
        Promise.resolve());
    } else {
      this.setState({
        nodes: tangle.nodes,
        links: tangle.links,
      }, () => {
        // Set all nodes' x by time value after state has been set
        this.recalculateFixedPositions();
      });
    }

    this.force.restart().alpha(1);
  }
  recalculateFixedPositions() {
    for (let node of this.state.nodes) {
      node.fx = this.xFromTime(node.time);
    }
  }
  xFromTime(time) {
    const padding = this.nodeRadius();
    // Avoid edge cases with 0 or 1 nodes
    if (this.state.nodes.length < 2) {
      return padding;
    }

    const maxTime = this.state.nodes[this.state.nodes.length-1].time;

    // Rescale nodes' x to cover [margin, width-margin]
    const scale = scaleLinear().domain([0, maxTime]);
    scale.range([padding, this.state.width - padding]);

    return scale(time);
  }
  mouseEntersNodeHandler(e) {
    const name = e.target.getAttribute('name');
    this.setState({
      hoveredNode: this.state.nodes.find(node => node.name === name),
    });
  }
  mouseLeavesNodeHandler(e) {
    this.setState({
      hoveredNode: undefined,
    });
  }
  getApprovedNodes(root) {
    if (!root) {
      return {nodes: new Set(), links: new Set()};
    }

    return getDescendants({
      nodes: this.state.nodes,
      links: this.state.links,
      root,
    });
  }
  getApprovingNodes(root) {
    if (!root) {
      return {nodes: new Set(), links: new Set()};
    }

    return getAncestors({
      nodes: this.state.nodes,
      links: this.state.links,
      root,
    });
  }
  getDirectApproversProbabilities(node) {
    if (!node) {
      return {};
    }
    const simTime = this.state.nodes[this.state.nodes.length-1].time;

    const approvers = getDirectApprovers({links: this.state.links, node})
      .filter(approver => approver.time < simTime - 1);

    return approvers.reduce((ans, node) => ({
      ...ans,
      [node.name]: approvers.length === 1 ? '100%' : `1/${approvers.length}`,
    }), {});
  }
  handleTipSelectionRadio(event) {
    this.setState({
      tipSelectionAlgorithm: event.target.value,
    }, () => {
      this.startNewTangle();
    });
  }
  render() {
    const {width, height} = this.state;
    const approved = this.getApprovedNodes(this.state.hoveredNode);
    const approving = this.getApprovingNodes(this.state.hoveredNode);
    const pathLinks = !this.state.oneByOne ? [] :
      this.state.links.filter(link =>
        this.state.path.some((node, i) =>
          this.state.path[i] === link.target && this.state.path[i+1] === link.source));

    const walkerDirectApproversProbabilities = this.getDirectApproversProbabilities(this.state.walker);
    const directWalkerApproverLinks = this.state.links.filter(link =>
      link.target === this.state.walker &&
      walkerDirectApproversProbabilities[link.source.name] !== undefined);
    const invisibleNodes = !this.state.oneByOne ? [] :
      this.state.nodes.filter(node =>
        node !== this.state.nodes[this.state.nodes.length-1] &&
        node.time + 1 > this.state.nodes[this.state.nodes.length-1].time);
    
    return (
      <div>
        <div className='top-bar-container' style={{width}}>
          <div className='left-cell'></div>
          <div className='right-cell'></div>
          <div className='top-bar-row'>
            <div className='slider-title'>Number of transactions</div>
            <div className='slider-container'>
              <SliderContainer
                min={nodeCountMin}
                max={nodeCountMax}
                defaultValue={nodeCountDefault}
                handle={sliderHandle}
                onChange={nodeCount => {
                  this.setState(Object.assign(this.state, {nodeCount}));
                  this.startNewTangle();
                }} />
            </div>
            <div className='tip-algo-label'>
              <TipAlgorithmLabel
                algoKey='UR'
                selectedAlgorithm={this.state.tipSelectionAlgorithm}
                onChange={this.handleTipSelectionRadio.bind(this)} />
            </div>
          </div>
          <div className='top-bar-row'>
            <div className='slider-title'>Transaction rate (λ)</div>
            <div className='slider-container'>
              <SliderContainer
                min={lambdaMin}
                max={lambdaMax}
                step={0.2}
                defaultValue={lambdaDefault}
                handle={sliderHandle}
                onChange={lambda => {
                  this.setState(Object.assign(this.state, {lambda}));
                  this.startNewTangle();
                }} />
            </div>
            <div className='tip-algo-label'>
              <TipAlgorithmLabel
                algoKey='UWRW'
                selectedAlgorithm={this.state.tipSelectionAlgorithm}
                onChange={this.handleTipSelectionRadio.bind(this)} />
            </div>
          </div>
          <div className='top-bar-row' style={{display: 'none'}}>
            <div className='slider-title'>alpha</div>
            <div className='slider-container'>
              <SliderContainer
                min={alphaMin}
                max={alphaMax}
                step={0.001}
                defaultValue={alphaDefault}
                marks={{[alphaMin]: `${alphaMin}`, [alphaMax]: `${alphaMax}`}}
                handle={sliderHandle}
                disabled={this.state.tipSelectionAlgorithm !== 'WRW'}
                onChange={alpha => {
                  this.setState(Object.assign(this.state, {alpha}));
                  this.startNewTangle();
                }} />
            </div>
            <div className='tip-algo-label'>
              <TipAlgorithmLabel
                algoKey='WRW'
                selectedAlgorithm={this.state.tipSelectionAlgorithm}
                onChange={this.handleTipSelectionRadio.bind(this)} />
            </div>
          </div>
          <div className='top-bar-row'>
            <div className='slider-title'>Animation speed</div>
            <div className='slider-container'>
              <SliderContainer
                min={0}
                max={1}
                step={0.01}
                defaultValue={defaultAnimationSpeed}
                handle={sliderHandle}
                onChange={animationSpeed => {
                  this.setState(Object.assign(this.state, {
                    oneByOne: animationSpeed < 1,
                    animationSpeed,
                  }));
                }} />
            </div>
            <div className='tip-algo-label'></div>
          </div>
        </div>
        <Tangle links={this.state.links} nodes={this.state.nodes}
          nodeCount={6}
          width={width}
          height={height}
          leftMargin={leftMargin}
          rightMargin={rightMargin}
          nodeRadius={this.nodeRadius()}
          mouseEntersNodeHandler={this.mouseEntersNodeHandler.bind(this)}
          mouseLeavesNodeHandler={this.mouseLeavesNodeHandler.bind(this)}
          approvedNodes={approved.nodes}
          approvedLinks={approved.links}
          approvingNodes={approving.nodes}
          approvingLinks={approving.links}
          hoveredNode={this.state.hoveredNode}
          tips={getTips({
            nodes: this.state.nodes,
            links: this.state.links,
          })}
          showLabels={this.nodeRadius() > showLabelsMinimumRadius ? true : false}
          walker={this.state.walker}
          walkerDirectApproversProbabilities={walkerDirectApproversProbabilities}
          newTransaction={this.state.oneByOne && this.state.nodes[this.state.nodes.length-1]}
          pathLinks={pathLinks}
          directWalkerApproverLinks={directWalkerApproverLinks}
          invisibleNodes={invisibleNodes}
        />
      </div>
    );
  }
}

const TangleContainerConnected = connect(
  mapStateToProps,
  mapDispatchToProps
)(TangleContainer);

export default TangleContainerConnected;
