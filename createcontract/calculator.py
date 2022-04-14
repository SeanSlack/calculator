from pyteal import *

# Calculator

def approval_program():

    on_create = Seq([
        App.globalPut(Bytes("owner"), Txn.sender()),
        App.globalPut(Bytes("Result"), Int(0)),
        Approve(),
    ])

    is_owner = Txn.sender() == App.globalGet(Bytes("owner"))

    #Declaring scratchspace, with type uint64
    scratchCount = ScratchVar(TealType.uint64)

    #Setting Function that allows user to change count value to any number
    SetNumber = Btoi(Txn.application_args[1])
    numberSet = Seq([
        #scratchCount.store(App.globalGet(Bytes("Counter"))), #putting the current value of counter in scratch space
        App.globalPut(Bytes("Result"), SetNumber), #then we are changing the value of counter by adding 1
        Approve(),
    ])

    #Addition Function which adds number
    numAdd = Btoi(Txn.application_args[1])
    addition = Seq([
        scratchCount.store(App.globalGet(Bytes("Result"))), #putting the current value of counter in scratch space
        App.globalPut(Bytes("Result"), scratchCount.load() + numAdd), #then we are changing the value of counter by adding 1
        Approve(),
    ])

    #Subtraction Function which minuses 1
    numSub = Btoi(Txn.application_args[1])
    subtraction = Seq([
        scratchCount.store(App.globalGet(Bytes("Result"))), #putting the current value of counter in scratch space
        If(scratchCount.load() > Int(0),
            App.globalPut(Bytes("Result"), scratchCount.load() - numSub), #then we are changing the value of counter by subtracting  1
        ),
        Approve(),
    ])

    numMultiply = Btoi(Txn.application_args[1])
    multiply = Seq([
        scratchCount.store(App.globalGet(Bytes("Result"))), #putting the current value of counter in scratch space
        App.globalPut(Bytes("Result"), scratchCount.load() * numMultiply), #then we are changing the value of counter by subtracting  1
        Approve(),
    ])

    on_call_method = Txn.application_args[0]
    on_call = Cond(
        [on_call_method == Bytes("-"), subtraction],
        [on_call_method == Bytes("+"), addition],
        [on_call_method == Bytes("x"), multiply],
        [on_call_method == Bytes("set"), numberSet],
        
    )

    program = Cond(
        [Txn.application_id() == Int(0), on_create],
        [Txn.on_completion() == OnComplete.NoOp, on_call],
        [Txn.on_completion() == OnComplete.OptIn, Approve()],
        [Txn.on_completion() == OnComplete.CloseOut, Approve()],
        [Txn.on_completion() == OnComplete.DeleteApplication, Return(is_owner)],
        [Txn.on_completion() == OnComplete.UpdateApplication, Return(is_owner)],
    )

    return program
    
def clear_state_program():
    return Approve()

if __name__ == "__main__":
    with open("approval.teal", "w") as f:
        compiled = compileTeal(approval_program(), mode=Mode.Application, version=5)
        f.write(compiled)

    with open("clear.teal", "w") as f:
        compiled = compileTeal(clear_state_program(), mode=Mode.Application, version=5)
        f.write(compiled)