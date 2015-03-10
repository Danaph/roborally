# Test Board
#          0                1             2              3
#                                                    ----------
#  0      Finish         PushDownEven  PushUpOdd     Checkpoint
#
#  1    |===Option===|   Void          Repair        ExpressLeft
#                        -----------
#  2      RollerRight      |           ExpressRight  ExpressUp
#                          |
#  3      RollerUp         | GearCw    GearCcw       ExpressUp
#                        -----------
#  4      Start          Start         Start         Start


describe 'GameLogic', ->
  LEFT  = GameLogic.LEFT
  RIGHT = GameLogic.RIGHT
  UP    = GameLogic.UP
  DOWN  = GameLogic.DOWN

  players_at = (x1, y1, x2=-1,y2=-1, x3=-1,y3=-1) ->
    game =  {
      name: "test",
      submitted: new Date().getTime(),
      started: true,
      gamePhase: GameState.PHASE.IDLE,
      playPhase: GameState.PLAY_PHASE.IDLE,
      playPhaseCount: 1,
      boardId: BoardBox.test_board_id
    }
    gameId = Games.insert(game)
    add_player(gameId, x1, y1)
    if x2 >= 0
      add_player(gameId, x2, y2)
    if x3 >= 0
      add_player(gameId, x3, y3)

    return Players.find({gameId: gameId}).fetch()

  add_player = (gameId, x, y, dir=GameLogic.UP) ->
    Players.insert({
      gameId: gameId,
      name: 'player',
      lives: 3,
      damage: 0,
      visited_checkpoints: 0,
      needsRespawn: false,
      position: {x: x, y: y},
      direction: dir
    })


  describe 'executeRollers', ->
    it 'moves robot on conveyor belt', ->
      players = players_at 0,3
      Meteor.wrapAsync(GameLogic.executeRollers)(players)
      expect(players[0]).toBeAt(0,2)
    it 'moves robot on express conveyor belt', ->
      players = players_at 0,3
      Meteor.wrapAsync(GameLogic.executeRollers)(players)
      expect(players[0]).toBeAt(0,2)
    it 'moves two adjacent robots', ->
      players = players_at 0,3, 0,2
      Meteor.wrapAsync(GameLogic.executeRollers)(players)
      expect(players[0]).toBeAt(0,2)
      expect(players[1]).toBeAt(1,2)
    it 'does not move robot if blocked at the end', ->
      players = players_at 0,2, 1,2
      Meteor.wrapAsync(GameLogic.executeRollers)(players)
      expect(players[0]).toBeAt(0,2)
    it 'does not move if robots meet on conveyor belt', ->
      players = players_at 2,2, 3,3
      Meteor.wrapAsync(GameLogic.executeRollers)(players)
      expect(players[0]).toBeAt(2,2)
      expect(players[1]).toBeAt(3,3)
    it 'rotates robots when moved on a turn', ->
      players = players_at 0,3
      Meteor.wrapAsync(GameLogic.executeRollers)(players)
      expect(players[0]).toFace RIGHT

  describe 'executeExpressRollers', ->
    it 'moves robot on express conveyor belt', ->
      players = players_at 3,3
      Meteor.wrapAsync(GameLogic.executeExpressRollers)(players)
      expect(players[0]).toBeAt(3,2)
    it 'does not move robot on normal conveyor belt', ->
      players = players_at 0,3
      Meteor.wrapAsync(GameLogic.executeExpressRollers)(players)
      expect(players[0]).toBeAt(0,3)


  describe 'executeLasers', ->
    describe 'robot lasers', ->
      it 'hits robot in sight', ->
        players = players_at 0,4, 0,0
        Meteor.wrapAsync(GameLogic.executeLasers)(players)
        expect(players[1].damage).toEqual(1)
      it 'does not hit if another robot is in between', ->
        players = players_at 0,4, 0,3, 0,0
        players[1].direction = LEFT
        Meteor.wrapAsync(GameLogic.executeLasers)(players)
        expect(players[2].damage).toEqual(0)
        expect(players[1].damage).toEqual(1)
      it 'does not hit if wall is in between', ->
        players = players_at 1,4, 1,0
        Meteor.wrapAsync(GameLogic.executeLasers)(players)
        expect(players[1].damage).toEqual(0)
      it 'fired even if robot is dying', ->
        players = players_at 0,4, 0,0
        players[1].damage = 8
        players[1].direction = DOWN
        Meteor.wrapAsync(GameLogic.executeLasers)(players)
        expect(players[1].damage).toEqual(9)
        expect(players[0].damage).toEqual(1)
      it 'not fired if powered down', ->
        players = players_at 0,4, 0,0
        players[0].powered_down = true
        Meteor.wrapAsync(GameLogic.executeLasers)(players)
        expect(players[1].damage).toEqual(0)
    describe 'board lasers', ->
      it 'increases damage by 1', ->
        players = players_at 1,2
        Meteor.wrapAsync(GameLogic.executeLasers)(players)
        expect(players[0].damage).toEqual(1)
    describe 'board double laser', ->
      it 'increases damage by 2 ', ->
        players = players_at 0,1
        Meteor.wrapAsync(GameLogic.executeLasers)(players)
        expect(players[0].damage).toEqual(2)

  describe 'executeRepairs', ->
    it 'decreases damage by 1', ->
      players = players_at(2, 1)
      players[0].damage = 5
      Meteor.wrapAsync(GameLogic.executeRepairs)(players)
      expect(players[0].damage).toEqual(4)
    it 'decreases damage on option sites', ->
      players = players_at(0, 2)
      players[0].damage = 5
      Meteor.wrapAsync(GameLogic.executeRepairs)(players)
      expect(players[0].damage).toEqual(4)
    it 'does not decrease 0 damage', ->
      players = players_at(2, 1)
      Meteor.wrapAsync(GameLogic.executeRepairs)(players)
      expect(players[0].damage).toEqual(0)
    it 'updates start position', ->
      players = players_at(2, 1)
      Meteor.wrapAsync(GameLogic.executeRepairs)(players)
      expect(players[0].start.x).toEqual(2)
      expect(players[0].start.y).toEqual(1)

  describe 'executeGears', ->
    describe 'clockwise gear', ->
      it 'rotates player', ->
        players = players_at(1,3)
        Meteor.wrapAsync(GameLogic.executeGears)(players)
        expect(players[0]).toFace(RIGHT)
    describe 'counterclockwise gear', ->
      it 'rotates player', ->
        players = players_at(2,3)
        Meteor.wrapAsync(GameLogic.executeGears)(players)
        expect(players[0]).toFace LEFT

  describe 'executePusher', ->
    describe 'even pusher', ->
      it 'pushes on even registers', ->
        players = players_at(1,0)
        game = players[0].game() #
        Games.update(players[0].gameId, {$set:{playPhaseCount:2}})
        Meteor.wrapAsync(GameLogic.executePushers)(players)
        expect(players[0]).toBeAt(1,1)
      it 'does not push on odd registers', ->
        players = players_at(1,0)
        Meteor.wrapAsync(GameLogic.executePushers)(players)
        expect(players[0]).toBeAt(1,0)

    describe 'odd pusher', ->
      it 'pushes on odd registers', ->
        players = players_at(2,0)
        Meteor.wrapAsync(GameLogic.executePushers)(players)
        expect(players[0]).toBeAt(2,-1)
      it 'does not push on even registers', ->
        players = players_at(2,0)
        Games.update(players[0].gameId, {$set:{playPhaseCount:2}})
        Meteor.wrapAsync(GameLogic.executePushers)(players)
        expect(players[0]).toBeAt(2,0)

  describe 'playCard', ->
    playCard = (players, type) ->
      card = {playerId: players[0]._id}
      card['cardType'] = switch type
        when 'forward'    then 5
        when 'backward'   then 3
        when 'turn left'  then 2
        when 'turn right' then 1
        when 'u-turn'     then 0
      Meteor.wrapAsync(GameLogic.playCard)(players, players[0], card)

    describe 'forward', ->
      it 'moves robot', ->
        players = players_at(0,4)
        playCard(players, 'forward')
        expect(players[0]).toBeAt(0,2)
      it 'pushes other robot', ->
        players = players_at(0,4, 0,3)
        playCard(players, 'forward')
        expect(players[0]).toBeAt(0,2)
        expect(players[1]).toBeAt(0,1)
      it 'is stopped by wall', ->
        players = players_at(1,4)
        playCard(players, 'forward')
        expect(players[0]).toBeAt(1,4)
      it 'pushes other robots up to a wall', ->
        players = players_at(3,3, 3,2, 3,1)
        playCard(players, 'forward')
        expect(players[0]).toBeAt(3,2)
        expect(players[1]).toBeAt(3,1)
        expect(players[2]).toBeAt(3,0)
    describe 'backward', ->
      it 'moves robot backwards', ->
        players = players_at(0,4)
        players[0].direction = DOWN
        playCard(players, 'backward')
        expect(players[0]).toBeAt(0,3)
    describe 'turn left', ->
      it 'rotates robot', ->
        players = players_at(0,4)
        playCard(players, 'turn left')
        expect(players[0]).toFace LEFT
      it 'does not move robot', ->
        players = players_at(0,4)
        playCard(players, 'turn left')
        expect(players[0]).toBeAt(0,4)
    describe 'turn right', ->
      it 'rotates robot', ->
        players = players_at(0,4)
        playCard(players, 'turn right')
        expect(players[0]).toFace RIGHT
      it 'does not move robot', ->
        players = players_at(0,4)
        playCard(players, 'turn right')
        expect(players[0]).toBeAt(0,4)
    describe 'u-turn', ->
      it 'rotates robot', ->
        players = players_at(0,4)
        playCard(players, 'u-turn')
        expect(players[0]).toFace DOWN
      it 'does not move robot', ->
        players = players_at(0,4)
        playCard(players, 'u-turn')
        expect(players[0]).toBeAt(0,4)
