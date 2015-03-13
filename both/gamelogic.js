GameLogic = {
  UP: 0,
  RIGHT: 1,
  DOWN: 2,
  LEFT: 3,
  OFF: 4,
  ON: 5,
  TIMER: 30,
  CARD_SLOTS: 5
};

(function (scope) {
  var _MAX_NUMBER_OF_CARDS = 9;
  var _CARD_PLAY_DELAY = 500;

  var _cardTypes = {
    0: {direction: 2, position: 0, name: "U_TURN"},
    1: {direction: 1, position: 0, name: "TURN_RIGHT"},
    2: {direction: -1, position: 0, name: "TURN_LEFT"},
    3: {direction: 0, position: -1, name: "STEP_BACKWARD"},
    4: {direction: 0, position: 1, name: "STEP_FORWARD"},
    5: {direction: 0, position: 2, name: "STEP_FORWARD_2"},
    6: {direction: 0, position: 3, name: "STEP_FORWARD_3"}
  };

  scope.discardCards = function(game,players) {
    var deck = Deck.findOne({gameId: game._id});
    if(typeof deck !== "undefined") {
      for (var i in players) {
        var playerCards=Cards.findOne({playerId: players[i]._id});
        var unusedCards=playerCards.cards;
        var origLockedCnt=playerCards.lockedCards.length;
        var lockedCards=[];
        console.log("Returning cards to deck, old total: "+deck.discards.length+" from "+players[i].name);
        for(var j in unusedCards) {
          deck.discards.push({priority: unusedCards[j].priority, cardType: unusedCards[j].cardType});
        }
        //Are there supposed to be locked cards?
        if(_MAX_NUMBER_OF_CARDS - players[i].damage < GameLogic.CARD_SLOTS) {
          for(var lockPtr = _MAX_NUMBER_OF_CARDS - players[i].damage; lockPtr<GameLogic.CARD_SLOTS; ++lockPtr) {
            lockedCards.push(players[i].playedCards[lockPtr]);
          }
        } else if(lockedCards.length>0){
          lockedCards=[];
        }
        console.log("Player Used Cards: " +players[i].playedCards.length+"|"+players[i].submittedCards.length);
        for(var k=0;players[i].playedCards!==null && k<players[i].playedCards.length; ++k) {
          deck.discards.push({priority: players[i].playedCards[k].priority, cardType: players[i].playedCards[k].cardType});
        }
        //Update the player's locked card count, skip the step if unchanged (Micro-optimization)
        if(lockedCards.length!=origLockedCnt) {
          playerCards.lockedCards=lockedCards;
          Cards.upsert({playerId: players[i]._id}, playerCards);
        }
        console.log("Returned cards, new total: "+deck.discards.length+" Overall Deck Size: "+(deck.cards.length+deck.discards.length));
      }
      Deck.upsert({gameId: game._id}, deck);
    }
  };

  scope.makeDeck = function(gameId) {
    var deck = Deck.findOne({gameId: gameId});
    //create/shuffle new deck (cards are returned from hands)
    if(typeof deck === "undefined") {
      Deck.upsert({gameId: gameId}, {$set: {cards: _.shuffle(_deck), discards: []}});
    } else if(deck.cards.length===0) {
      deck.cards=_.shuffle(deck.discards);
      deck.discards=[];
      Deck.upsert({gameId: gameId}, deck);
    }
    return deck;
  };

  scope.dealCards = function(player) {
    var deck = Deck.findOne({gameId: player.gameId});
    var playerCards = Cards.findOne({playerId: player._id});

    if (!playerCards) {
      playerCards = {gameId: player.gameId, playerId: player._id, userId: player.userId, cards: [], lockedCards: []};
    }
    //Rule note: You do not keep un-used cards from prior turn.
    playerCards.cards = [];
    var nrOfNewCards = (_MAX_NUMBER_OF_CARDS - player.damage); //for every damage you get a card less

    for (var j = 0; j < nrOfNewCards; j++) {
      //Remake the deck if it's out of cards.
      //Warning, could crash if discard deck runs out.  But there's more then 9*8=72 cards right?
      if(deck.cards.length===0) {
        Deck.update(deck._id, deck);
        deck=GameLogic.makeDeck(player.gameId);
      }
      var cardFromDeck = deck.cards.splice(0, 1)[0]; //grab card from deck, so it can't be handed out twice
      playerCards.cards.push({
        cardId: Meteor.uuid(),
        cardType: cardFromDeck.cardType,
        priority: cardFromDeck.priority
      });
    }

    // if player was powered down last turn there might be not enough locked cards
    if (playerCards.lockedCards.length + nrOfNewCards < 5) {
      for (var k = 0; k < 5 - (playerCards.lockedCards.length + nrOfNewCards); k++) {
        if(deck.cards.length===0) {
          Deck.update(deck._id, deck);
          deck=GameLogic.makeDeck(player.gameId);
        }
        var cardFromDeck = deck.cards.splice(0, 1)[0]; //grab card from deck, so it can't be handed out twice
        playerCards.lockedCards.push({
          cardId: Meteor.uuid(),
          cardType: cardFromDeck.cardType,
          priority: cardFromDeck.priority
        });
      }
    }

    Cards.upsert({playerId: player._id}, playerCards);
    Deck.update(deck._id, deck);
  };

  scope.submitCards = function(player, cards) {
    console.log('player ' + player.name + ' submitted cards: ');

    if (player.isPoweredDown()) {
      Players.update(player._id, {$set: {
        submitted: true,
        damage: 0,
      }});
    } else {
      //check if all played cards are available from original hand...
        //Except locked cards, those are not in the hand.
        var playerCards = Cards.findOne({playerId: player._id});
        var availableCards = playerCards.cards;
        var lockedCards = playerCards.lockedCards;

      for (var i = cards.length-1; i >= 0; i--) {
        var found = false;
        for (var j = 0; j < availableCards.length; j++) {
          if (cards[i].cardId == availableCards[j].cardId) {
            availableCards.splice(j, 1);
            console.log(_cardTypes[cards[i].cardType].name + ' ');
            found = true;
            break;
          }
        }
        if (!found) {
          console.log("illegal card detected! (removing card)");
          cards.splice(i, 1);
        }
      }

      if (cards.length + lockedCards.length < GameLogic.CARD_SLOTS) {
        console.log("Not enough cards submitted");
        var nrOfNewCards = GameLogic.CARD_SLOTS - cards.length - lockedCards.length;
        for (var q = 0; q < nrOfNewCards; q++) {
          var cardFromHand = availableCards.splice(_.random(0, availableCards.length-1), 1)[0]; //grab card from hand
          console.log("Handing out random card", cardFromHand);
          cards.push({cardId: Meteor.uuid(), cardType: cardFromHand.cardType, priority: cardFromHand.priority});
        }
      }

      Players.update(player._id, {$set: {
        submittedCards: cards,
        submittedLockedCards: lockedCards,
        submitted: true,
        optionalInstantPowerDown: false
      }});
      Cards.update({playerId: player._id}, {$set: {
        cards: availableCards,
        lockedCards: lockedCards
      }});
    }
    var playerCnt = Players.find({gameId: player.gameId}).count();
    var readyPlayerCnt = Players.find({gameId: player.gameId, submitted: true}).count();
    if (readyPlayerCnt === playerCnt) {
      Games.update(player.gameId, {$set: {timer: -1}});
      GameState.nextGamePhase(player.gameId);
    } else if (readyPlayerCnt === playerCnt-1) {
      //start timer
      Games.update(player.gameId, {$set: {timer: 1}});
      Meteor.setTimeout(function() {
        if (Games.findOne(player.gameId).timer === 1) {
          console.log("time up! setting timer to 0");
          Games.update(player.gameId, {$set: {timer: 0}});

          //wait for player to auto-submit selected cards..
          Meteor.setTimeout(function() {
            //if nothing happened the system to should auto-submit random cards..
            if (Players.find({gameId: player.gameId, submitted: true}).count() == 1) {
              var unsubmittedPlayer = Players.findOne({gameId: player.gameId, submitted: false});
              GameLogic.submitCards(unsubmittedPlayer, []);
              console.log("Player " + unsubmittedPlayer.name + " did not respond, submitting random cards");
            }
          }, 2500);
        }
      }, GameLogic.TIMER * 1000);
    }
  };

  scope.playCard = function(players, player, card, callback) {
    if(!player.needsRespawn) {
      console.log("trying to play next card for player " + player.name);

      if (card !== undefined) {
        var cardType = _cardTypes[card.cardType];
        console.log('playing card ' + cardType.name + ' for player ' + player.name);

        player.rotate(cardType.direction);

        if (cardType.position === 0) {
          Meteor.wrapAsync(checkRespawnsAndUpdateDb)(player, _CARD_PLAY_DELAY);
        } else {
          var step = Math.min(cardType.position, 1);
          for (var j = 0; j < Math.abs(cardType.position); j++) {
            var timeout = j+1 < Math.abs(cardType.position) ? 0 : _CARD_PLAY_DELAY; //don't delay if there is another step to execute
            executeStep(players, player, step, timeout);
            if (player.needsRespawn) {
              break; //player respawned, don't continue playing out this card.
            }
          }
        }
      } else {
        console.log("card is not playable " + card + " player " + player.name);
      }
    }
    callback();
  };

  scope.executeRollers = function(players, callback) {
    var roller_moves = [];
    players.forEach(function(player) {
      //check if is on roller
      var tile = player.tile();
      var moving = (tile.type === Tile.ROLLER);
      roller_moves.push(rollerMove(player, tile, moving));
    });
    tryToMovePlayersOnRollers(roller_moves);
    callback();
  };

  // move players 2nd step in roller direction; 1st step is done by executeRollers,
  scope.executeExpressRollers = function(players, callback) {
    var roller_moves = [];
    players.forEach(function(player) {
      //check if is on roller
      var tile = player.tile();
      var moving  = (tile.type === Tile.ROLLER && tile.speed === 2);
      roller_moves.push(rollerMove(player, tile, moving));
    });
    tryToMovePlayersOnRollers(roller_moves);
    callback();
  };

  scope.executeGears = function(players, callback) {
    players.forEach(function(player) {
      if (player.tile().type === Tile.GEAR) {
        player.rotate(player.tile().rotate);
        Players.update(player._id, player);
      }
    });
    callback();
  };

  scope.executePushers = function(players, callback) {
    var game = players[0].game();
    players.forEach(function(player) {
      var tile = player.tile();
      if (tile.type === Tile.PUSHER &&  game.playPhaseCount % 2 === tile.pusher_type ) {
        tryToMovePlayer(players, player, tile.move, _CARD_PLAY_DELAY);
      }
    });
    callback();
  };

  scope.executeLasers = function(players, callback) {
    var victims = [];
    players.forEach(function(player) {
      var tile = player.tile();
      if (tile.damage > 0) {
        player.damage += tile.damage;
        console.log(player.name + " got " + tile.damage + " on " + tile.type + "tile");
        checkRespawnsAndUpdateDb(player, _CARD_PLAY_DELAY);
      }
      if (!player.isPoweredDown()) {
        victims.push(scope.shootRobotLaser(players, player));
      }
    });
    victims.forEach(function(victim) {
      if (victim) {
        victim.damage++;
        checkRespawnsAndUpdateDb(victim, _CARD_PLAY_DELAY);
      }
    });
    callback();
  };

  scope.executeRepairs = function(players, callback) {
    players.forEach(function(player) {
      if (player.tile().repair) {
        player.updateStartPosition();
        if (player.damage > 0)
          player.damage--;
        Players.update(player._id, player);
      }
    });
    callback();
  };

  scope.shootRobotLaser = function(players, player) {
    var step = {x:0, y:0};
    var board = player.board();
    switch (player.direction) {
      case GameLogic.UP:
        step.y = -1;
        break;
      case GameLogic.RIGHT:
        step.x = 1;
        break;
      case GameLogic.DOWN:
        step.y = 1;
        break;
      case GameLogic.LEFT:
        step.x = -1;
        break;
    }
    var x = player.position.x;
    var y = player.position.y;

    while (board.onBoard(x+step.x,y+step.y) && board.canMove(x, y, step) ) {
      x += step.x;
      y += step.y;
      var victim = isPlayerOnTile(players,x,y);
      if (victim) {
        debug_info = 'Shot: (' + player.position.x +','+player.position.y+') -> ('+x+','+y+')';
        victim.chat('was shot by '+ player.name +', Total damage: '+ (victim.damage+1), debug_info);
        return victim;
      }
    }
    return false;
  };

  function executeStep(players, player, direction, timeout) {   // direction = 1 for step forward, -1 for step backwards
    var step = { x: 0, y: 0 };
    switch (player.direction) {
      case GameLogic.UP:
        step.y = -1 * direction;
        break;
      case GameLogic.RIGHT:
        step.x = direction;
        break;
      case GameLogic.DOWN:
        step.y = direction;
        break;
      case GameLogic.LEFT:
        step.x = -1 * direction;
        break;
    }
    tryToMovePlayer(players, player, step, timeout);
  }

  function tryToMovePlayer(players, p, step, timeout) {
    var board = p.board();
    var makeMove = true;
    if (step.x !== 0 || step.y !== 0) {
      console.log("trying to move player "+p.name+" to "+ (p.position.x+step.x)+","+(p.position.y+step.y));

      if (board.canMove(p.position.x, p.position.y, step)) {
        var pushedPlayer = isPlayerOnTile(players, p.position.x + step.x, p.position.y + step.y);
        if (pushedPlayer !== null) {
          console.log("trying to push player "+pushedPlayer.name);
          makeMove=tryToMovePlayer(players, pushedPlayer, step, timeout);
        }
        if(makeMove) {
          console.log("moving player "+p.name+" to "+ (p.position.x+step.x)+","+(p.position.y+step.y));
          p.move(step);
          Meteor.wrapAsync(checkRespawnsAndUpdateDb)(p, timeout);
          return true;
        }
      }
    }
    return false;
  }

  function rollerMove(player, tile, is_moving) {
    if (is_moving) {
      return {
        player: player,
        x: player.position.x+tile.move.x,
        y: player.position.y+tile.move.y,
        rotate: tile.rotate,
        step:tile.move,
        canceled: false
      };
    } else { // to detect conflicts add non-moving players
      return {
        player: player,
        x: player.position.x,
        y: player.position.y,
        canceled: true
      };
    }
  }

  function tryToMovePlayersOnRollers(moves) {
    var move_canceled = true;
    while (move_canceled) {  // if a move was canceled we have to check for other conflicts again
      move_canceled = false;
      for (var i=0;i<moves.length;++i) {
        for (var j=i+1;j<moves.length;++j) {
          if (moves[i].x === moves[j].x && moves[i].y === moves[j].y) {
            moves[i].canceled = true;
            moves[j].canceled = true;
            moves[i].x = moves[i].player.position.x;
            moves[j].x = moves[j].player.position.x;
            moves[i].y = moves[i].player.position.y;
            moves[j].y = moves[j].player.position.y;
            move_canceled = true;
          }
        }
      }
    }
    moves.forEach(function(roller_move) {
      if (!roller_move.canceled) {
        //move player 1 step in roller direction and rotate
        roller_move.player.move(roller_move.step);
        roller_move.player.rotate(roller_move.rotate);
        checkRespawnsAndUpdateDb(roller_move.player, _CARD_PLAY_DELAY);
      }
    });
  }

  function isPlayerOnTile(players, x, y) {
    var found = null;
    players.forEach(function(player) {
      if (player.position.x == x && player.position.y == y) {
        found = player;
      }
    });
    return found;
  }

  function checkRespawnsAndUpdateDb(player, timeout, callback) {
    Meteor.setTimeout(function() {
      console.log(player.name+" Player.position "+player.position.x+","+player.position.y+" "+player.isOnBoard()+"|"+player.isOnVoid());
      if (!player.isOnBoard() || player.isOnVoid() || player.damage > 9) {
        player.submittedCards = [];
        player.damage = 2;
        player.lives--;
        player.needsRespawn=true;
        player.optionalInstantPowerDown=true;
        Players.update(player._id, player);
        if (player.damage > 0) {
          var game = player.game();
          game.waitingForRespawn.push(player._id);
          Games.update(game._id, game);
        }
        player.chat('died! (lives: '+ player.lives +', damage: '+ player.damage +')');
        Meteor.wrapAsync(removePlayerWithDelay)(player);
      } else {
        console.log("updating position", player.name);
        Players.update(player._id, player);
      }

      if (callback) {
        callback();
      }
    }, timeout);
  }

  function removePlayerWithDelay(player, callback) {
    Meteor.setTimeout(function() {
      player.position.x = -1;
      player.position.y = 0;
      Players.update(player._id, player);
      console.log("removing player", player.name);
      Players.update(player._id, player);
      callback();
    }, _CARD_PLAY_DELAY);
  }

  scope.respawnPlayerAtPos = function(player,x,y) {
    player.position.x = x;
    player.position.y = y;
    console.log("respawning player", player.name,'at', x,',',y);
    Players.update(player._id, player);
  };

  scope.respawnPlayerWithDir = function(player,dir) {
    player.direction = dir;
    player.needsRespawn = false;
    Players.update(player._id, player);
  };

  scope.updatePowerState = function(playerId, state) {
    player = Players.findOne(playerId);
    //Meteor.setTimeout(function() {
      Players.update(player._id, {$set:{powerState: state}});
    //});
  };

  var _deck = [
    { priority:  10, cardType: 0 },
    { priority:  20, cardType: 0 },
    { priority:  30, cardType: 0 },
    { priority:  40, cardType: 0 },
    { priority:  50, cardType: 0 },
    { priority:  60, cardType: 0 },
    { priority:  70, cardType: 2 },
    { priority:  80, cardType: 1 },
    { priority:  90, cardType: 2 },
    { priority: 100, cardType: 1 },
    { priority: 110, cardType: 2 },
    { priority: 120, cardType: 1 },
    { priority: 130, cardType: 2 },
    { priority: 140, cardType: 1 },
    { priority: 150, cardType: 2 },
    { priority: 160, cardType: 1 },
    { priority: 170, cardType: 2 },
    { priority: 180, cardType: 1 },
    { priority: 190, cardType: 2 },
    { priority: 200, cardType: 1 },
    { priority: 210, cardType: 2 },
    { priority: 220, cardType: 1 },
    { priority: 230, cardType: 2 },
    { priority: 240, cardType: 1 },
    { priority: 250, cardType: 2 },
    { priority: 260, cardType: 1 },
    { priority: 270, cardType: 2 },
    { priority: 280, cardType: 1 },
    { priority: 290, cardType: 2 },
    { priority: 300, cardType: 1 },
    { priority: 310, cardType: 2 },
    { priority: 320, cardType: 1 },
    { priority: 330, cardType: 2 },
    { priority: 340, cardType: 1 },
    { priority: 350, cardType: 2 },
    { priority: 360, cardType: 1 },
    { priority: 370, cardType: 2 },
    { priority: 380, cardType: 1 },
    { priority: 390, cardType: 2 },
    { priority: 400, cardType: 1 },
    { priority: 410, cardType: 2 },
    { priority: 420, cardType: 1 },
    { priority: 430, cardType: 3 },
    { priority: 440, cardType: 3 },
    { priority: 450, cardType: 3 },
    { priority: 460, cardType: 3 },
    { priority: 470, cardType: 3 },
    { priority: 480, cardType: 3 },
    { priority: 490, cardType: 4 },
    { priority: 500, cardType: 4 },
    { priority: 510, cardType: 4 },
    { priority: 520, cardType: 4 },
    { priority: 530, cardType: 4 },
    { priority: 540, cardType: 4 },
    { priority: 550, cardType: 4 },
    { priority: 560, cardType: 4 },
    { priority: 570, cardType: 4 },
    { priority: 580, cardType: 4 },
    { priority: 590, cardType: 4 },
    { priority: 600, cardType: 4 },
    { priority: 610, cardType: 4 },
    { priority: 620, cardType: 4 },
    { priority: 630, cardType: 4 },
    { priority: 640, cardType: 4 },
    { priority: 650, cardType: 4 },
    { priority: 660, cardType: 4 },
    { priority: 670, cardType: 5 },
    { priority: 680, cardType: 5 },
    { priority: 690, cardType: 5 },
    { priority: 700, cardType: 5 },
    { priority: 710, cardType: 5 },
    { priority: 720, cardType: 5 },
    { priority: 730, cardType: 5 },
    { priority: 740, cardType: 5 },
    { priority: 750, cardType: 5 },
    { priority: 760, cardType: 5 },
    { priority: 770, cardType: 5 },
    { priority: 780, cardType: 5 },
    { priority: 790, cardType: 6 },
    { priority: 800, cardType: 6 },
    { priority: 810, cardType: 6 },
    { priority: 820, cardType: 6 },
    { priority: 830, cardType: 6 },
    { priority: 840, cardType: 6 }
  ];
})(GameLogic);
