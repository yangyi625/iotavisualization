const jStat = require('jStat').jStat;

export const generateTangle = ({nodeCount,beta=1 ,lambda = 1.5, h=1, alpha=0.5, tipSelectionAlgorithm}) => {
  jStat.exponential.sample(lambda);
  const genesis = {
    name: '0',
    time: 0,
    milestone:true
  };
  let milestonetime=beta;
  let nodes = [genesis];
  let time = h;
  //let milestoneCount = Math.floor(nodeCount*beta);
  while (nodes.length < nodeCount) {
    const delay = jStat.exponential.sample(lambda);
    time += delay;
    if ((time>milestonetime))
    {
      nodes.push({
        name: `${nodes.length}`,
        milestone:true,
        time,
        x: 300,
        y: 200, });
        milestonetime+=beta;
    }
    else{
    nodes.push({
        name: `${nodes.length}`,
        milestone:false,
        time,
        x: 300,
        y: 200,
      });
    }
  }

  const links = [];
  var startpoint;
  for (let node of nodes) {
    if(node.name=="0") startpoint=node;
    const candidates = nodes
      .filter(candidate => candidate.time < node.time - h);
    const candidateLinks = links
      .filter(link => link.source.time < node.time - h);

    const tips = tipSelectionAlgorithm({
      nodes: candidates,
      links: candidateLinks,
      start: startpoint,
      alpha,
    });

    if (tips.length > 0) {
      links.push({source: node, target: tips[0]});
      if (tips.length > 1 && tips[0].name !== tips[1].name ) {
        links.push({source: node, target: tips[1]});
      }
    }
    if(node.milestone) 
    {
      startpoint=node;
    }
  };

  return {
    nodes,
    links,
  };
};
