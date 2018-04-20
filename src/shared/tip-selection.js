import {choose, isTip, randomWalk, weightedRandomWalk, calculateWeights} from './algorithms';

export const uniformRandom = ({nodes, links}) => {
  const candidates = nodes.filter(node => isTip({links, node}));

  return candidates.length === 0 ? [] : [choose(candidates), choose(candidates)];
};

export const unWeightedMCMC = ({nodes, links}) => {
  if (nodes.length === 0) {
    return [];
  }

  const start = nodes[0]; // Start in genesis

  return [
    randomWalk({links, start}),
    randomWalk({links, start}),
  ];
};

export const weightedMCMC = ({nodes,links,start,alpha}) => {
  if (nodes.length === 0) {
    return [];
  }
  
  //const start = nodes[0]; // Start in genesis
                          //start in lastsolid milestone
  //var start = nodes[0];
  calculateWeights({nodes, links});
  var tip,tip1;
  tip=weightedRandomWalk({links, start, alpha});          
  var start = nodes[0];
  tip1=weightedRandomWalk({links, start, alpha});

  return [
    tip,
    tip1
  ];
};
